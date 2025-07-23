import { NextApiRequest, NextApiResponse } from "next"
import { createClient } from '@supabase/supabase-js'
import { withAuth, withRateLimit, apiError, AuthenticatedRequest } from "@/lib/auth-middleware"
import { openai, isOpenAIConfigured } from "@/lib/openai-client"
import { checkEnvironment, getConfig } from "@/lib/config"
import { logError, logConfigError } from "@/lib/error-logger"

async function chatHandler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return apiError(res, 405, "Method not allowed", "METHOD_NOT_ALLOWED")
  }

  // Validate environment at runtime (non-blocking)
  const validation = checkEnvironment()
  if (!validation.isValid) {
    console.warn("Environment validation warnings:", validation.errors)
    // Continue anyway in development - don't block chat functionality
  }

  // Check if OpenAI is properly configured
  if (!isOpenAIConfigured()) {
    return apiError(res, 503, "Chat service unavailable", "OPENAI_NOT_CONFIGURED",
      "OpenAI API key is not configured. Please contact support.")
  }

  const { messages, documentContext } = req.body

  if (!messages || !Array.isArray(messages)) {
    return apiError(res, 400, "Messages array is required", "INVALID_MESSAGES")
  }

  const config = getConfig()
  const supabase = createClient(
    config.supabase.url,
    config.supabase.serviceRoleKey
  )

  // Apply rate limiting per user
  try {
    await withRateLimit(req.user.id, 20, 2, async () => {
      // Rate limit: 20 requests per user, refill 2 tokens per minute
    })
  } catch (error) {
    return apiError(res, 429, "Rate limit exceeded. Please try again later.", "RATE_LIMIT_EXCEEDED")
  }

  // Retrieve document context if specified
  let contextualInformation = ""
  if (documentContext && Array.isArray(documentContext.documentIds) && documentContext.documentIds.length > 0) {
    try {
      // Get relevant document chunks based on the user's query
      const userQuery = messages[messages.length - 1]?.content || ""
      
      // Search for relevant content in specified documents
      const { data: relevantChunks, error: searchError } = await supabase
        .from('document_chunks')
        .select(`
          content,
          page_number,
          chunk_type,
          documents!inner(name)
        `)
        .eq('user_id', req.user.id)
        .in('document_id', documentContext.documentIds)
        .textSearch('content', userQuery)
        .limit(5)

      if (searchError) {
        console.error('Document search error:', searchError)
      } else if (relevantChunks && relevantChunks.length > 0) {
        contextualInformation = `

DOCUMENT CONTEXT:
The following information is from the user's uploaded documents:

${relevantChunks
  .map((chunk, index) => {
    const docName = (chunk as any).documents?.name ?? 'Unknown';
    return `[${index + 1}] From "${docName}" (Page ${chunk.page_number}):
${chunk.content.substring(0, 800)}${chunk.content.length > 800 ? '...' : ''}`;
  })
  .join('\n')}

Please reference this document context in your response when relevant.`
      }
    } catch (error) {
      console.error('Error retrieving document context:', error)
    }
  }

  const systemMessage = {
    role: "system" as const,
    content: `You are OM Intel, an advanced AI assistant specializing in commercial real estate analysis and document review. You are professional, insightful, and highly knowledgeable about:

- Commercial real estate transactions and valuations
- Property investment analysis and due diligence
- Market trends and comparative analysis
- Financial modeling and cash flow projections
- Lease agreements and property management
- Zoning, development, and regulatory matters
- Risk assessment and mitigation strategies

Your communication style is:
- Professional yet approachable
- Clear and concise
- Data-driven with actionable insights
- Focused on helping users make informed decisions

When analyzing documents or answering questions:
- Provide specific, detailed analysis
- Highlight key risks and opportunities
- Offer practical recommendations
- Ask clarifying questions when needed
- Reference relevant market standards and best practices
- When document context is provided, reference specific details from the documents
- Cite page numbers and document names when referencing uploaded content

Always maintain confidentiality and provide accurate, helpful information to support commercial real estate professionals in their decision-making process.${contextualInformation}`
  }

  try {
    // Set up Server-Sent Events headers for proper streaming
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Disable Nginx buffering
    })

    // Create streaming response using the standard chat completions API
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [systemMessage, ...messages],
      temperature: 0.7,
      max_tokens: 2000,
      stream: true,
      // Note: Add functions here if needed
      // functions: [ /* your function schemas */ ],
    })

    // Stream chunks as Server-Sent Events
    for await (const chunk of response) {
      const content = chunk.choices[0]?.delta?.content || ""
      if (content) {
        // Format as SSE data
        res.write(`data: ${JSON.stringify({ content })}\n\n`)
      }
      
      // Send function calls if present
      if (chunk.choices[0]?.delta?.function_call) {
        res.write(`data: ${JSON.stringify({ 
          function_call: chunk.choices[0].delta.function_call 
        })}\n\n`)
      }
    }

    // Send completion event
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
    res.end()
  } catch (error) {
    logError(error, {
      endpoint: '/api/chat',
      userId: req.user.id,
      errorType: 'OPENAI_API_ERROR'
    })
    
    // If headers haven't been sent yet, send error response
    if (!res.headersSent) {
      return apiError(res, 500, "Failed to get response from AI", "OPENAI_ERROR",
        error instanceof Error ? error.message : "Unknown error")
    } else {
      // If streaming has started, send error as SSE
      res.write(`data: ${JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error" 
      })}\n\n`)
      res.end()
    }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return withAuth(req, res, chatHandler)
}