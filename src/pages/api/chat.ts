import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { withAuth, withRateLimit, apiError, AuthenticatedRequest } from '@/lib/auth-middleware'
import { openai, isOpenAIConfigured } from '@/lib/openai-client'
import { checkEnvironment, getConfig } from '@/lib/config'
import { logError } from '@/lib/error-logger'
import type { Database } from '@/types/database'

// Unified request type supporting both simple and complex formats
interface UnifiedChatRequest {
  // Simple format (chat-enhanced compatibility)
  message?: string
  sessionId?: string
  chat_session_id?: string // legacy field
  documentId?: string
  document_id?: string // legacy field
  
  // Complex format (chat-v2 compatibility)
  messages?: Array<{
    role: 'user' | 'assistant' | 'system'
    content: string
  }>
  documentContext?: {
    documentIds: string[]
    maxChunks?: number
    relevanceThreshold?: number
  }
  options?: {
    model?: string
    temperature?: number
    maxTokens?: number
    stream?: boolean
  }
}

// Migration helper function to normalize different request formats
function normalizeRequest(body: any): UnifiedChatRequest {
  return {
    message: body.message,
    messages: body.messages,
    sessionId: body.sessionId || body.chat_session_id,
    documentId: body.documentId || body.document_id,
    documentContext: body.documentContext,
    options: body.options || {}
  }
}

async function chatHandler(req: AuthenticatedRequest, res: NextApiResponse) {
  // Request body logging removed for production
  
  if (req.method !== 'POST') {
    return apiError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED')
  }

  // Validate environment at runtime (non-blocking)
  const validation = checkEnvironment()
  if (!validation.isValid) {
    console.warn("Environment validation warnings:", validation.errors)
  }

  // Check if OpenAI is properly configured
  if (!isOpenAIConfigured()) {
    return apiError(res, 503, "Chat service unavailable", "OPENAI_NOT_CONFIGURED",
      "OpenAI API key is not configured. Please contact support.")
  }

  // Normalize and validate request format
  const normalizedRequest = normalizeRequest(req.body)
  const isSimple = typeof normalizedRequest.message === 'string'

  // Validate request format
  if (isSimple && !normalizedRequest.message) {
    return apiError(res, 400, 'Message is required for simple format', 'MISSING_MESSAGE')
  }
  if (!isSimple && (!normalizedRequest.messages || !Array.isArray(normalizedRequest.messages))) {
    return apiError(res, 400, 'Messages array is required for complex format', 'INVALID_MESSAGES')
  }

  // Log deprecated endpoint usage
  const deprecatedEndpoint = req.headers['x-deprecated-endpoint'] as string
  if (deprecatedEndpoint) {
    console.warn(`Deprecated endpoint used: /api/${deprecatedEndpoint}`, {
      userId: req.user.id,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString()
    })
  }

  const config = getConfig()
  const supabase = createClient<Database>(
    config.supabase.url,
    config.supabase.serviceRoleKey
  )

  // Apply rate limiting per user (simplified for now)
  try {
    await withRateLimit(req.user.id, 20, 2, async () => {
      // Rate limit: 20 requests per user, refill 2 tokens per minute
    })
  } catch (error) {
    return apiError(res, 429, "Rate limit exceeded. Please try again later.", "RATE_LIMIT_EXCEEDED")
  }

  try {
    // Handle session management
    let sessionId = normalizedRequest.sessionId
    if (isSimple && !sessionId) {
      // Auto-create session for simple format
      const { data: newSession, error: sessionError } = await supabase
        .from('chat_sessions')
        .insert({
          user_id: req.user.id,
          title: normalizedRequest.message!.slice(0, 50) + (normalizedRequest.message!.length > 50 ? '...' : ''),
          document_id: normalizedRequest.documentId || null
        })
        .select()
        .single()

      if (sessionError) {
        return apiError(res, 500, 'Failed to create chat session', 'SESSION_ERROR')
      }

      sessionId = newSession.id
    } else if (sessionId) {
      // Verify session belongs to user
      const { error: sessionVerifyError } = await supabase
        .from('chat_sessions')
        .select('id')
        .eq('id', sessionId)
        .eq('user_id', req.user.id)
        .single()

      if (sessionVerifyError) {
        return apiError(res, 404, 'Chat session not found', 'SESSION_NOT_FOUND')
      }
    }

    // Handle document context
    let contextualInformation = ""
    const documentIds = normalizedRequest.documentContext?.documentIds || 
      (normalizedRequest.documentId ? [normalizedRequest.documentId] : [])
    
    if (documentIds.length > 0) {
      try {
        const userQuery = isSimple ? normalizedRequest.message : 
          normalizedRequest.messages?.[normalizedRequest.messages.length - 1]?.content || ""
        
        // Get document chunks
        const { data: relevantChunks, error: searchError } = await supabase
          .from('document_chunks')
          .select(`
            content,
            page_number,
            chunk_type,
            documents!inner(original_filename)
          `)
          .eq('user_id', req.user.id)
          .in('document_id', documentIds)
          .textSearch('content', userQuery)
          .limit(5)

        if (!searchError && relevantChunks && relevantChunks.length > 0) {
          contextualInformation = `

DOCUMENT CONTEXT:
The following information is from the user's uploaded documents:

${relevantChunks
  .map((chunk, index) => {
    const docName = (chunk as any).documents?.original_filename ?? 'Unknown';
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

    // Build messages for OpenAI
    let messages: Array<{ role: 'user' | 'assistant' | 'system', content: string }> = []
    
    if (isSimple) {
      // For simple format, save user message and get conversation history
      if (sessionId) {
        await supabase.from('messages').insert({
          chat_session_id: sessionId,
          role: 'user',
          content: normalizedRequest.message!
        })

        // Get conversation history
        const { data: history } = await supabase
          .from('messages')
          .select('role, content')
          .eq('chat_session_id', sessionId)
          .order('created_at', { ascending: true })

        messages = (history || []) as Array<{ role: 'user' | 'assistant' | 'system', content: string }>
      } else {
        // No session, just use the current message
        messages = [{ role: 'user', content: normalizedRequest.message! }]
      }
    } else {
      // For complex format, use provided messages
      messages = normalizedRequest.messages!
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

    // Always use SSE format for backward compatibility (since frontend expects it)
    const useSSEFormat = true
    const shouldStream = normalizedRequest.options?.stream !== false

    if (shouldStream) {
      // Set up streaming headers
      const headers: Record<string, string> = {
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
      
      if (useSSEFormat) {
        headers['Content-Type'] = 'text/event-stream'
        headers['X-Accel-Buffering'] = 'no'
      } else {
        headers['Content-Type'] = 'text/plain; charset=utf-8'
      }
      
      if (sessionId) {
        headers['X-Chat-Session-Id'] = sessionId
      }
      
      res.writeHead(200, headers)

      // Create streaming response
      const response = await openai.chat.completions.create({
        model: normalizedRequest.options?.model || "gpt-4o",
        messages: [systemMessage, ...messages],
        temperature: normalizedRequest.options?.temperature || 0.7,
        max_tokens: normalizedRequest.options?.maxTokens || 2000,
        stream: true,
      })

      let assistantResponse = ""
      let buffer = ''
      let lastFlush = Date.now()
      const FLUSH_INTERVAL = 50
      const MIN_CHUNK_SIZE = 5
      
      const flushBuffer = () => {
        if (buffer) {
          if (useSSEFormat) {
            res.write(`data: ${JSON.stringify({ content: buffer })}\n\n`)
          } else {
            res.write(buffer)
          }
          assistantResponse += buffer
          buffer = ''
          lastFlush = Date.now()
        }
      }

      for await (const chunk of response) {
        console.log('🔄 CHUNK:', chunk.choices[0]?.delta || chunk)
        const content = chunk.choices[0]?.delta?.content || ""
        if (content) {
          buffer += content
          
          const shouldFlush = buffer.length >= MIN_CHUNK_SIZE || 
                             (Date.now() - lastFlush) >= FLUSH_INTERVAL
          
          if (shouldFlush) {
            flushBuffer()
          }
        }
      }
      
      flushBuffer()

      if (useSSEFormat) {
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
      }

      // Save assistant response if we have a session
      if (sessionId && assistantResponse) {
        await supabase.from('messages').insert({
          chat_session_id: sessionId,
          role: 'assistant',
          content: assistantResponse
        })

        await supabase.from('chat_sessions')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', sessionId)
      }

      res.end()
    } else {
      // Non-streaming response
      const response = await openai.chat.completions.create({
        model: normalizedRequest.options?.model || "gpt-4o",
        messages: [systemMessage, ...messages],
        temperature: normalizedRequest.options?.temperature || 0.7,
        max_tokens: normalizedRequest.options?.maxTokens || 2000,
        stream: false,
      })

      const assistantContent = response.choices[0]?.message?.content || ""

      // Save messages if we have a session
      if (sessionId) {
        await supabase.from('messages').insert({
          chat_session_id: sessionId,
          role: 'assistant',
          content: assistantContent
        })

        await supabase.from('chat_sessions')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', sessionId)
      }

      res.status(200).json({
        id: response.id,
        content: assistantContent,
        model: response.model,
        usage: response.usage,
        sessionId
      })
    }

  } catch (error) {
    logError(error, {
      endpoint: '/api/chat',
      userId: req.user.id,
      errorType: 'CHAT_ERROR'
    })
    
    if (!res.headersSent) {
      return apiError(res, 500, "Failed to get response from AI", "OPENAI_ERROR",
        error instanceof Error ? error.message : "Unknown error")
    } else {
      if (deprecatedEndpoint === 'chat-enhanced' || deprecatedEndpoint === 'chat') {
        res.write(`data: ${JSON.stringify({ 
          error: error instanceof Error ? error.message : "Unknown error" 
        })}\n\n`)
      }
      res.end()
    }
  }
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return withAuth(req, res, chatHandler)
}

export { chatHandler }
