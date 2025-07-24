import { NextApiRequest, NextApiResponse } from "next"
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'
import { withAuth, withRateLimit, apiError, AuthenticatedRequest } from "@/lib/auth-middleware"
import { openai, isOpenAIConfigured } from "@/lib/openai-client"
import { checkEnvironment, getConfig } from "@/lib/config"

async function chatEnhancedHandler(req: AuthenticatedRequest, res: NextApiResponse) {
  try {
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

    const { message, chat_session_id, document_id } = req.body

    if (!message || typeof message !== 'string') {
      return apiError(res, 400, "Message is required", "INVALID_MESSAGE")
    }

    const config = getConfig()
    const supabase = createClient<Database>(
      config.supabase.url,
      config.supabase.serviceRoleKey
    )

    // Apply rate limiting per user
    try {
      await withRateLimit(req.user.id, 15, 1, async () => {
        // Rate limit: 15 requests per user, refill 1 token per minute
      })
    } catch (error) {
      return apiError(res, 429, "Rate limit exceeded. Please try again later.", "RATE_LIMIT_EXCEEDED")
    }

    let sessionId = chat_session_id

    // If no session provided, create a new one
    if (!sessionId) {
      const { data: newSession, error: sessionError } = await supabase
        .from('chat_sessions')
        .insert({
          user_id: req.user.id,
          title: message.slice(0, 50) + (message.length > 50 ? '...' : '')
        })
        .select()
        .single()

      if (sessionError) {
        return res.status(500).json({ error: 'Failed to create chat session' })
      }

      sessionId = newSession.id
    }

    // Verify session belongs to user
    const { data: session, error: sessionVerifyError } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', req.user.id)
      .single()

    if (sessionVerifyError) {
      return res.status(404).json({ error: 'Chat session not found' })
    }

    // Save user message
    const { error: userMessageError } = await supabase
      .from('messages')
      .insert({
        chat_session_id: sessionId,
        role: 'user',
        content: message
      })

    if (userMessageError) {
      console.error('Error saving user message:', userMessageError)
    }

    // Get conversation history
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('role, content')
      .eq('chat_session_id', sessionId)
      .order('created_at', { ascending: true })

    if (messagesError) {
      console.error('Error fetching messages:', messagesError)
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

Do not start responses with greetings or introductions. Answer user questions directly and professionally. Always maintain confidentiality and provide accurate, helpful information to support commercial real estate professionals in their decision-making process.`
    }

    // Set up Server-Sent Events headers for streaming
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Disable Nginx buffering
      "X-Chat-Session-Id": sessionId, // Return session ID in header
    })

    // Handle document context if document_id is provided
    let documentContext = ""
    if (document_id) {
      try {
        // Fetch document record from database
        const { data: documentRecord, error: docError } = await supabase
          .from('documents')
          .select('filename, original_filename, status')
          .eq('id', document_id)
          .eq('user_id', req.user.id) // Ensure user owns the document
          .single()

        if (docError || !documentRecord) {
          console.error('Document not found:', docError)
          return apiError(res, 404, "Document not found", "DOCUMENT_NOT_FOUND")
        }

        if (documentRecord.status !== 'completed') {
          return apiError(res, 400, "Document is still processing", "DOCUMENT_NOT_READY")
        }

        // Fetch pre-parsed document chunks from database
        const { data: documentChunks, error: chunksError } = await supabase
          .from('document_chunks')
          .select('content, page_number, chunk_type')
          .eq('document_id', document_id)
          .eq('user_id', req.user.id)
          .order('page_number', { ascending: true })

        if (chunksError) {
          console.error('Failed to fetch document chunks:', chunksError)
          return apiError(res, 500, "Failed to retrieve document content", "CHUNKS_ERROR")
        }

        if (documentChunks && documentChunks.length > 0) {
          // Combine text chunks into document context
          documentContext = documentChunks
            .map(chunk => chunk.content)
            .join('\n\n')
          
          console.log(`Loaded document context: ${documentContext.length} characters from ${documentRecord.original_filename} (${documentChunks.length} chunks)`)
        } else {
          console.warn(`No parsed content found for document: ${documentRecord.original_filename}`)
          
          // Fallback: try to get content from extracted_text field
          const { data: docWithText, error: textError } = await supabase
            .from('documents')
            .select('extracted_text')
            .eq('id', document_id)
            .eq('user_id', req.user.id)
            .single()

          if (!textError && docWithText?.extracted_text) {
            documentContext = docWithText.extracted_text
            console.log(`Using fallback extracted_text: ${documentContext.length} characters`)
          } else {
            console.warn('No document content available - document may not have been processed correctly')
          }
        }
      } catch (error) {
        console.error('Error processing document:', error)
        return apiError(res, 500, "Failed to process document", "DOCUMENT_PROCESSING_ERROR")
      }
    }

    // Enhance system message with document context
    const enhancedSystemMessage = {
      role: "system" as const,
      content: documentContext 
        ? `${systemMessage.content}\n\n=== DOCUMENT CONTEXT ===\n\nYou are analyzing the following document:\n\n${documentContext}\n\n=== END DOCUMENT CONTEXT ===\n\nPlease analyze this document and answer questions about it. When referencing information, be specific about what you found in the document.`
        : systemMessage.content
    }

    const conversationHistory = messages || []
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [enhancedSystemMessage, ...conversationHistory],
      stream: true,
      temperature: 0.7,
      max_tokens: 2000,
    })

    let assistantResponse = ""

    // Buffer for smoother streaming
    let buffer = ''
    let lastFlush = Date.now()
    const FLUSH_INTERVAL = 50 // milliseconds
    const MIN_CHUNK_SIZE = 5 // characters
    
    const flushBuffer = () => {
      if (buffer) {
        res.write(`data: ${JSON.stringify({ content: buffer })}\n\n`)
        assistantResponse += buffer
        buffer = ''
        lastFlush = Date.now()
      }
    }

    // Stream chunks as Server-Sent Events with buffering
    for await (const chunk of completion) {
      const content = chunk.choices[0]?.delta?.content || ""
      if (content) {
        buffer += content
        
        // Flush buffer based on size or time
        const shouldFlush = buffer.length >= MIN_CHUNK_SIZE || 
                           (Date.now() - lastFlush) >= FLUSH_INTERVAL
        
        if (shouldFlush) {
          flushBuffer()
        }
      }
      
      // Send function calls if present
      if (chunk.choices[0]?.delta?.function_call) {
        flushBuffer() // Flush any buffered content first
        res.write(`data: ${JSON.stringify({ 
          function_call: chunk.choices[0].delta.function_call 
        })}\n\n`)
      }
    }
    
    // Flush any remaining buffered content
    flushBuffer()

    // Send completion event
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`)

    // Save assistant response
    if (assistantResponse) {
      await supabase
        .from('messages')
        .insert({
          chat_session_id: sessionId,
          role: 'assistant',
          content: assistantResponse
        })

      // Update session timestamp
      await supabase
        .from('chat_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', sessionId)
    }

    res.end()
  
  } catch (error) {
    console.error("=== CHAT API ERROR ===")
    console.error("Error:", error)
    console.error("Stack:", error instanceof Error ? error.stack : 'No stack trace')
    console.error("Message:", error instanceof Error ? error.message : String(error))
    console.error("Request body:", JSON.stringify(req.body))
    console.error("User ID:", req.user?.id)
    console.error("======================")
    
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
  return withAuth(req, res, chatEnhancedHandler)
}