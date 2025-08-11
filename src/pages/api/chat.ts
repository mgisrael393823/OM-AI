import type { NextApiRequest, NextApiResponse } from 'next'
import { withAuth, withRateLimit, type AuthenticatedRequest } from '@/lib/auth-middleware'
import { createChatCompletion } from '@/lib/services/openai'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type Msg = { role: 'system' | 'user' | 'assistant'; content: string }

/**
 * Chat endpoint handler that requires authentication
 */
async function chatHandler(req: AuthenticatedRequest, res: NextApiResponse) {
  const requestId = `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`
  
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ 
        error: 'Method not allowed',
        code: 'METHOD_NOT_ALLOWED'
      })
    }

    const { messages = [], model: clientModel, sessionId } = (req.body ?? {}) as any
    
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ 
        error: 'messages[] required',
        code: 'INVALID_REQUEST'
      })
    }

    const model = (clientModel || process.env.OPENAI_MODEL || process.env.OPENAI_FALLBACK_MODEL || 'gpt-4o-2024-08-06').trim()
    console.log(`[chat] Request ${requestId} using model: ${model}`)

    // Call OpenAI with proper error handling
    const ai = await createChatCompletion({
      model,
      messages: messages as Msg[],
      temperature: 0.2,
      max_output_tokens: Number(process.env.CHAT_MAX_TOKENS ?? 2000)
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
      ok: true,
      text: ai.text,
      model: ai.model,
      usage: ai.usage,
      requestId
    })
    
  } catch (error: any) {
    console.error(`[${requestId}] Chat error:`, {
      message: error?.message,
      status: error?.status,
      stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
    })
    
    // Return structured error response
    const statusCode = error?.status || 500
    const errorMessage = error?.message || 'Internal server error'
    
    return res.status(statusCode).json({ 
      ok: false,
      error: errorMessage,
      code: error?.code || 'CHAT_ERROR',
      requestId
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