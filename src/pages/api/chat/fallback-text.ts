import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { withAuth, withRateLimit, type AuthenticatedRequest } from '@/lib/auth-middleware'
import { createChatCompletion, fixResponseFormat } from '@/lib/services/openai'
import { chatCompletion as buildChatCompletion, responses as buildResponses } from '@/lib/services/openai/builders'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { isResponsesModel } from '@/lib/services/openai/modelUtils'
import { retrieveTopK } from '@/lib/rag/retriever'
import { augmentMessagesWithContext } from '@/lib/rag/augment'
import * as kvStore from '@/lib/kv-store'
import { structuredLog, generateRequestId } from '@/lib/log'

// Force Node.js runtime for singleton consistency
export const runtime = 'nodejs'

// KV-based idempotency for distributed systems
const FALLBACK_IDEMPOTENCY_TTL = 2 * 60 * 1000 // 2 minutes in milliseconds

// Request schema for fallback endpoint
const FallbackRequestSchema = z.object({
  model: z.string().optional(),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string()
  })).optional(),
  input: z.string().optional(),
  sessionId: z.string().optional(),
  correlationId: z.string().optional(),
  metadata: z.object({
    documentId: z.string().optional()
  }).optional()
}).refine(data => data.input || data.messages, {
  message: "Either 'input' or 'messages' must be provided"
})

/**
 * Fallback endpoint for tool-only responses
 * Forces text output with tool_choice: "none" and response_format: {type: "text"}
 */
async function fallbackTextHandler(req: AuthenticatedRequest, res: NextApiResponse) {
  const requestId = req.headers['x-correlation-id'] as string || generateRequestId('fallback')
  const userId = req.user?.id || 'anonymous'
  const rawDocumentId = (req.body as any)?.metadata?.documentId as string | undefined
  
  // Check for duplicate request ID using KV store (distributed idempotency)
  const clientRequestId = req.headers['x-request-id'] as string || requestId
  const idempotencyKey = `fallback:${clientRequestId}`
  
  try {
    // Check if this request was already processed
    const existingEntry = await kvStore.getItem(idempotencyKey)
    if (existingEntry) {
      structuredLog('warn', 'Duplicate fallback request blocked', {
        documentId: rawDocumentId,
        requestId: clientRequestId,
        userId,
        source: 'kv_idempotency_check',
        existingTimestamp: existingEntry.timestamp,
        request_id: requestId
      })
      
      return res.status(409).json({
        error: 'Duplicate request',
        code: 'DUPLICATE_FALLBACK_REQUEST',
        message: 'This fallback request has already been processed',
        request_id: requestId
      })
    }
    
    // Mark request as processed in KV store
    await kvStore.setItem(idempotencyKey, {
      timestamp: Date.now(),
      userId,
      requestId
    }, FALLBACK_IDEMPOTENCY_TTL)
    
  } catch (idempotencyError) {
    structuredLog('warn', 'Failed to check/set idempotency', {
      documentId: rawDocumentId,
      requestId: clientRequestId,
      userId,
      error: idempotencyError instanceof Error ? idempotencyError.message : 'Unknown error',
      request_id: requestId
    })
    // Continue processing if KV fails - better to allow than block legitimate requests
  }
  
  // Set proper headers to prevent caching
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Content-Type', 'application/json')
  
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ 
        error: 'Method not allowed',
        code: 'METHOD_NOT_ALLOWED',
        request_id: requestId
      })
    }

    const parseResult = FallbackRequestSchema.safeParse(req.body)
    
    if (!parseResult.success) {
      return res.status(400).json({ 
        error: 'Invalid request format for fallback',
        code: 'INVALID_FALLBACK_REQUEST',
        details: parseResult.error.flatten().fieldErrors,
        request_id: requestId
      })
    }

    const validRequest = parseResult.data
    const model = validRequest.model || process.env.OPENAI_MODEL || 'gpt-4o'
    
    // Build messages for processing
    let messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = []
    
    if (validRequest.messages) {
      messages = validRequest.messages
    } else if (validRequest.input) {
      messages = [{ role: 'user', content: validRequest.input }]
    }
    
    // Add system message to enforce text output and structure
    const systemMessage = {
      role: 'system' as const,
      content: 'You must provide a clear, structured text response. Use short headings, bold lead phrases, and bullet points where appropriate. Always include a brief natural-language answer even when tools might be available. Focus on being helpful and concise.'
    }
    
    // Insert system message at the beginning if not already present
    if (!messages.some(m => m.role === 'system')) {
      messages.unshift(systemMessage)
    }

    // Document context augmentation if provided
    if (validRequest.metadata?.documentId) {
      const documentId = validRequest.metadata.documentId
      const latestUser = [...messages].reverse().find(m => m.role === 'user')
      
      try {
        const chunks = await retrieveTopK({
          documentId,
          query: latestUser?.content || '',
          k: 8,
          maxCharsPerChunk: 1000,
          userId
        })

        if (chunks.length > 0) {
          const augmented = augmentMessagesWithContext(chunks, messages)
          messages = isResponsesModel(model) ? augmented.responses : augmented.chat
        }
      } catch (contextError) {
        structuredLog('warn', 'Failed to retrieve document context for fallback', {
          documentId,
          userId,
          error: contextError instanceof Error ? contextError.message : String(contextError),
          request_id: requestId
        })
      }
    }

    // Build payload with forced text output
    const payload = isResponsesModel(model)
      ? buildResponses({ 
          model, 
          input: messages.map(m => ({ content: m.content, role: m.role })), 
          max_output_tokens: 600 // Cap output length
        })
      : buildChatCompletion({ 
          model, 
          messages, 
          max_tokens: 600 // Cap output length
        })

    // Force text output and disable tools if present
    if (payload.tools && Array.isArray(payload.tools) && payload.tools.length > 0) {
      payload.tool_choice = 'none'
    }
    payload.stream = false
    
    fixResponseFormat(payload)

    structuredLog('info', 'Fallback request initiated', {
      documentId: validRequest.metadata?.documentId,
      userId,
      model,
      apiFamily: isResponsesModel(model) ? 'responses' : 'chat',
      messageCount: messages.length,
      hasDocumentContext: !!(validRequest.metadata?.documentId),
      request_id: requestId
    })

    // Call OpenAI with forced text output
    const ai = await createChatCompletion(payload)

    // Guard against null/undefined AI response
    if (!ai || typeof ai !== 'object') {
      throw new Error('Invalid AI response: received null or non-object response')
    }

    // Ensure we have text content
    const textContent = (ai?.content || '').trim()
    if (!textContent) {
      structuredLog('warn', 'Fallback produced empty content - using default', {
        documentId: validRequest.metadata?.documentId,
        userId,
        model,
        request_id: requestId
      })
      
      // Return a default message rather than failing
      return res.status(200).json({
        message: "I understand your request but need more context. Could you please rephrase or provide more details?",
        model: ai?.model || model,
        usage: ai?.usage || {},
        source: 'fallback_default',
        request_id: requestId
      })
    }

    // Log successful fallback
    structuredLog('info', 'Fallback request completed', {
      documentId: validRequest.metadata?.documentId,
      userId,
      model,
      contentLength: ai?.content?.length || 0,
      usage: ai?.usage || {},
      request_id: requestId
    })

    // Best-effort persistence if session provided
    if (validRequest.sessionId) {
      try {
        const supabase = getSupabaseAdmin()
        await supabase.from('messages').insert({
          chat_session_id: validRequest.sessionId,
          role: 'assistant',
          content: ai?.content || '',
          metadata: { 
            requestId, 
            usage: ai?.usage || {}, 
            model: ai?.model || model,
            apiFamily: isResponsesModel(model) ? 'responses' : 'chat',
            source: 'fallback'
          }
        })
      } catch (persistErr) {
        console.warn(`[${requestId}] Failed to persist fallback message:`, persistErr)
      }
    }

    return res.status(200).json({ 
      message: ai?.content || '',
      model: ai?.model || model,
      usage: ai?.usage || {},
      source: 'fallback',
      request_id: requestId
    })
    
  } catch (error: any) {
    structuredLog('error', 'Fallback request failed', {
      documentId: rawDocumentId,
      userId,
      error: error?.message,
      status: error?.status,
      request_id: requestId
    })
    
    const statusCode = error?.status >= 500 || error?.message?.includes('OpenAI') ? 502 : 500
    
    return res.status(statusCode).json({ 
      error: 'Fallback request failed',
      code: 'FALLBACK_ERROR',
      message: error?.message || 'Unknown fallback error',
      request_id: requestId
    })
  }
}

// Compose middleware: auth first, then rate limiting
export default withRateLimit({ 
  id: 'chat-fallback', 
  tokens: 10, 
  windowMs: 60000 
})(withAuth(fallbackTextHandler))