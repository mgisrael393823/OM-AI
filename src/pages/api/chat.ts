import { NextApiRequest, NextApiResponse } from "next"
import OpenAI from "openai"
import { createClient } from '@supabase/supabase-js'
import { withAuth, withRateLimit, apiError, AuthenticatedRequest } from "@/lib/auth-middleware"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

async function chatHandler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return apiError(res, 405, "Method not allowed", "METHOD_NOT_ALLOWED")
  }

  const { messages, documentContext } = req.body

  if (!messages || !Array.isArray(messages)) {
    return apiError(res, 400, "Messages array is required", "INVALID_MESSAGES")
  }

  if (!process.env.OPENAI_API_KEY) {
    return apiError(res, 500, "OpenAI API key not configured", "MISSING_OPENAI_KEY")
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
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
    // Set up Server-Sent Events headers for streaming
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    })

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [systemMessage, ...messages],
      stream: true,
      temperature: 0.7,
      max_tokens: 2000,
    })

    for await (const chunk of completion) {
      const content = chunk.choices[0]?.delta?.content || ""
      if (content) {
        res.write(content)
      }
    }

    res.end()
  } catch (error) {
    console.error("OpenAI API error:", error)
    return apiError(res, 500, "Failed to get response from AI", "OPENAI_ERROR",
      error instanceof Error ? error.message : "Unknown error")
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return withAuth(req, res, chatHandler)
}