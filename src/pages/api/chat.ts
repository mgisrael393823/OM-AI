import type { NextApiRequest, NextApiResponse } from 'next'
import { withAuth, withRateLimit, type AuthenticatedRequest } from '@/lib/auth-middleware'
import { createChatCompletion } from '@/lib/services/openai'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type Msg = { role: 'system' | 'user' | 'assistant'; content: string }

// Union type for both API formats
type ChatCompletionRequest = {
  messages: Msg[]
  model?: string
  sessionId?: string
}

type ResponsesAPIRequest = {
  input: string
  model?: string
  max_output_tokens?: number
  sessionId?: string
}

type ChatRequest = ChatCompletionRequest | ResponsesAPIRequest

function isChatCompletionRequest(req: any): req is ChatCompletionRequest {
  return Array.isArray(req.messages)
}

function isResponsesAPIRequest(req: any): req is ResponsesAPIRequest {
  return typeof req.input === 'string'
}

/**
 * Chat endpoint handler that requires authentication
 */
async function chatHandler(req: AuthenticatedRequest, res: NextApiResponse) {
  const requestId = `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`
  
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ 
        error: 'Method not allowed',
        code: 'METHOD_NOT_ALLOWED',
        request_id: requestId
      })
    }

    const requestBody = req.body ?? {}
    
    // Validate request format (union of both API types)
    if (!isChatCompletionRequest(requestBody) && !isResponsesAPIRequest(requestBody)) {
      return res.status(400).json({ 
        error: 'Invalid request format. Either messages[] or input required',
        code: 'INVALID_REQUEST_FORMAT',
        request_id: requestId
      })
    }

    // Extract common fields
    const { model: clientModel, sessionId } = requestBody
    let messages: Msg[] = []

    if (isChatCompletionRequest(requestBody)) {
      if (!Array.isArray(requestBody.messages) || requestBody.messages.length === 0) {
        return res.status(400).json({ 
          error: 'messages[] required for Chat Completions format',
          code: 'INVALID_MESSAGES',
          request_id: requestId
        })
      }
      messages = requestBody.messages
    } else {
      // Convert Responses API input to messages format for internal processing
      messages = [{ role: 'user', content: requestBody.input }]
    }

    const model = (clientModel || process.env.OPENAI_MODEL || process.env.OPENAI_FALLBACK_MODEL || 'gpt-4o-2024-08-06').trim()
    console.log(`[chat] Request ${requestId} using model: ${model}`)

    // Call OpenAI with proper error handling
    const ai = await createChatCompletion({
      model,
      messages: messages as Msg[],
      temperature: 0.2,
      max_output_tokens: isResponsesAPIRequest(requestBody) 
        ? requestBody.max_output_tokens 
        : Number(process.env.CHAT_MAX_TOKENS ?? 2000)
    })

    // Best-effort persistence (non-fatal on error)
    if (sessionId) {
      try {
        await supabaseAdmin.from('messages').insert({
          chat_session_id: sessionId,
          role: 'assistant',
          content: ai.text,
          metadata: { requestId, usage: ai.usage, model: ai.model }
        })
      } catch (persistErr) {
        console.warn(`[${requestId}] Failed to persist chat message:`, persistErr)
      }
    }

    return res.status(200).json({ 
      message: ai.text,
      model: ai.model,
      usage: ai.usage,
      request_id: ai.request_id || requestId
    })
    
  } catch (error: any) {
    // Log upstream error once with stable tag, no stack traces in prod
    console.error(`[chat-upstream-error] ${requestId}:`, {
      message: error?.message,
      status: error?.status,
      code: error?.code,
      type: error?.type,
      ...(process.env.NODE_ENV === 'development' && { stack: error?.stack })
    })
    
    // Determine if this is an upstream OpenAI error (return 502) or client error (return 4xx)
    const isUpstreamError = error?.status >= 500 || 
                           error?.message?.includes('OpenAI') ||
                           error?.message?.includes('timeout') ||
                           error?.message?.includes('ETIMEDOUT')
    
    const statusCode = isUpstreamError ? 502 : (error?.status || 500)
    const errorType = isUpstreamError ? 'UPSTREAM_ERROR' : (error?.code || 'CHAT_ERROR')
    
    return res.status(statusCode).json({ 
      code: errorType,
      type: error?.type || 'api_error',
      message: error?.message || 'Chat processing failed',
      request_id: error?.request_id || requestId
    })
  }
}

// Compose middleware: auth first, then rate limiting
// Each middleware returns a (req, res) => Promise<void> function
export default withRateLimit({ 
  id: 'chat', 
  tokens: 20, 
  windowMs: 60000 
})(withAuth(chatHandler))