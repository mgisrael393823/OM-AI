import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { withAuth, withRateLimit, type AuthenticatedRequest } from '@/lib/auth-middleware'
import { createChatCompletion, fixResponseFormat } from '@/lib/services/openai'
import { chatCompletion as buildChatCompletion, responses as buildResponses } from '@/lib/services/openai/builders'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { isChatModel, isResponsesModel as isResponsesModelUtil } from '@/lib/services/openai/modelUtils'
import { retrieveTopK } from '@/lib/rag/retriever'
import { augmentMessagesWithContext } from '@/lib/rag/augment'
import * as kvStore from '@/lib/kv-store'
import { structuredLog, generateRequestId } from '@/lib/log'
import crypto from 'crypto'

// System message for structured output
const STRUCTURED_OUTPUT_SYSTEM_MESSAGE = {
  role: 'system' as const,
  content: 'You are a helpful assistant for commercial real estate analysis. Always provide clear, structured responses using markdown formatting. Use short headings (## or ###), bold lead phrases for key points, and bullet lists where appropriate. Always include a brief natural-language answer even when tools are used. Be concise but thorough, and limit responses to essential information.'
}

// Force Node.js runtime for singleton consistency
export const runtime = 'nodejs'

// Message schema for validation
const MessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string()
})

// Base schema for shared fields
const BaseRequestSchema = z.object({
  sessionId: z.string().optional(), // Only string, null will be rejected
  stream: z.boolean().optional(),
  metadata: z.object({
    documentId: z.string().optional()
  }).optional()
})

// Chat Completions API schema
const ChatCompletionSchema = BaseRequestSchema.extend({
  apiFamily: z.literal('chat').optional(),
  model: z.string().optional(),
  messages: z.array(MessageSchema),
  max_tokens: z.number().optional()
})

// Responses API schema with flexible input types
const ResponsesAPISchema = BaseRequestSchema.extend({
  apiFamily: z.literal('responses'),
  model: z.string().optional(),
  input: z.union([
    z.string(),
    z.array(z.object({ 
      text: z.string(),
      role: z.enum(['user', 'assistant', 'system']).optional() 
    }))
  ]).optional(),
  messages: z.array(MessageSchema).optional(),
  max_output_tokens: z.number().optional()
}).refine(data => data.input || data.messages, {
  message: "Either 'input' or 'messages' must be provided for Responses API"
})

// Auto-detect schema (when apiFamily is not specified)
const AutoDetectSchema = BaseRequestSchema.extend({
  model: z.string().optional(),
  input: z.union([
    z.string(),
    z.array(z.object({ 
      text: z.string(),
      role: z.enum(['user', 'assistant', 'system']).optional() 
    }))
  ]).optional(),
  messages: z.array(MessageSchema).optional(),
  max_tokens: z.number().optional(),
  max_output_tokens: z.number().optional()
}).refine(data => data.input || data.messages, {
  message: "Either 'input' or 'messages' must be provided"
})

// Union schema for all request types
const ChatRequestSchema = z.union([ChatCompletionSchema, ResponsesAPISchema, AutoDetectSchema])

// Type definitions
type ChatRequest = z.infer<typeof ChatRequestSchema>
type Message = z.infer<typeof MessageSchema>

// Model detection for auto-selecting API family
const RESPONSES_MODEL_PATTERN = /^(gpt-5($|-)|gpt-4\.1($|-)|o4|o3)/i
const isResponsesModel = (model: string) => RESPONSES_MODEL_PATTERN.test(model)

// Deal points intent detection
const DEAL_POINTS_INTENTS = [
  'deal points',
  'highlights', 
  'key terms',
  'summary',
  'at-a-glance',
  'deal terms',
  'transaction summary',
  'investment highlights',
  'offering highlights',
  'executive summary',
  'terms summary'
]

/**
 * Detect if query is asking for deal points/highlights
 */
function isDealPointsQuery(query: string): boolean {
  const lowerQuery = query.toLowerCase()
  return DEAL_POINTS_INTENTS.some(intent => 
    lowerQuery.includes(intent)
  )
}

/**
 * Get content hash from document metadata or compute from context
 */
async function getDocumentHash(documentId: string, userId: string): Promise<string | null> {
  try {
    // For mem- documents, try to get existing context and compute hash
    if (documentId.startsWith('mem-')) {
      const context = await kvStore.getContext(documentId, userId)
      if (context && context.chunks) {
        const contentText = context.chunks.map(c => c.text || '').join('')
        return crypto.createHash('sha256').update(contentText).digest('hex').substring(0, 40)
      }
    }
    return null
  } catch (error) {
    console.warn('[getDocumentHash] Failed to compute hash:', error)
    return null
  }
}

/**
 * Internal text fallback helper - mirrors context and forces text output
 * Used when JSON parsing fails, content is empty, or schema validation fails
 */
async function runTextFallback(
  originalPayload: any,
  messages: Message[],
  apiFamily: 'chat' | 'responses',
  reason: 'json_parse' | 'timeout' | 'empty_content' | 'schema_error',
  signal: AbortSignal
): Promise<{content: string, model: string, usage: any, reason: string}> {
  const fallbackPayload = apiFamily === 'responses'
    ? buildResponses({ 
        model: originalPayload.model,
        input: messages.map(m => ({ content: m.content, role: m.role })), 
        max_output_tokens: Math.min(originalPayload.max_output_tokens || 600, 600)
      })
    : buildChatCompletion({ 
        model: originalPayload.model,
        messages, 
        max_tokens: Math.min(originalPayload.max_tokens || 600, 600) 
      })
  
  // Force text output and disable tools if present
  if (fallbackPayload.tools && Array.isArray(fallbackPayload.tools) && fallbackPayload.tools.length > 0) {
    fallbackPayload.tool_choice = 'none'
  }
  fallbackPayload.stream = false
  
  // Preserve temperature from original (if any)
  if (originalPayload.temperature !== undefined) {
    fallbackPayload.temperature = originalPayload.temperature
  }

  fixResponseFormat(fallbackPayload)
  const fallbackResult = await createChatCompletion(fallbackPayload, { signal })
  
  return {
    content: fallbackResult.content || '',
    model: fallbackResult.model || originalPayload.model,
    usage: fallbackResult.usage,
    reason
  }
}

/**
 * Chat endpoint handler that supports both Chat Completions and Responses API
 */
async function chatHandler(req: AuthenticatedRequest, res: NextApiResponse) {
  // Kill switch: Route to conversational endpoint when flag is enabled
  if (process.env.CONVERSATIONAL_CHAT === '1') {
    const { default: conversationalHandler } = await import('./chat-conversational')
    return conversationalHandler(req, res)
  }

  const requestId = generateRequestId('chat')
  const userId = req.user?.id || 'anonymous'
  let correlationId: string = (req.headers['x-correlation-id'] as string) || requestId
  let requestBody: any
  
  // Unified 13s timeout budget: 9s primary + 4s fallback
  const controller = new AbortController()
  const primaryTimeout = setTimeout(() => controller.abort(), 9000) // 9s for primary
  const signal = controller.signal
  
  // Track timing and outcomes for terminal logging
  const startTime = Date.now()
  let outcome: 'primary' | 'fallback' | 'cache_hit' = 'primary'
  let failure_cause: string | undefined
  
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ 
        error: 'Method not allowed',
        code: 'METHOD_NOT_ALLOWED',
        request_id: requestId
      })
    }

    requestBody = req.body ?? {}
    
    // Reject legacy {message} format - require proper schema
    if (requestBody.message && typeof requestBody.message === 'string') {
      return res.status(400).json({
        error: 'Invalid request format',
        code: 'INVALID_REQUEST_FORMAT',
        details: {
          message: 'Legacy {message: string} format is not supported. Use Chat Completions or Responses API format.',
          allowed_formats: [
            {
              name: 'Chat Completions API',
              required: ['messages'],
              optional: ['model', 'max_tokens', 'sessionId', 'stream', 'metadata'],
              example: {
                model: 'gpt-4o',
                messages: [{role: 'user', content: 'What is the cap rate for this property?'}],
                sessionId: 'optional-session-id',
                stream: true
              }
            },
            {
              name: 'Responses API', 
              required: ['input OR messages'],
              optional: ['model', 'max_output_tokens', 'sessionId', 'stream', 'metadata'],
              examples: [
                {
                  model: 'gpt-5',
                  input: 'What is the cap rate for this property?',
                  sessionId: 'optional-session-id',
                  stream: true
                },
                {
                  model: 'gpt-5', 
                  messages: [{role: 'user', content: 'What is the cap rate for this property?'}],
                  sessionId: 'optional-session-id',
                  stream: true
                }
              ]
            }
          ]
        },
        request_id: requestId
      })
    }
    
    // Explicitly reject null sessionId
    if (requestBody.sessionId === null) {
      return res.status(400).json({
        error: 'Invalid request format',
        code: 'INVALID_REQUEST_FORMAT',
        details: {
          message: 'sessionId cannot be null. Either omit the field or provide a valid string value.',
          allowed_formats: [
            {
              name: 'Chat Completions API',
              required: ['messages'],
              optional: ['model', 'max_tokens', 'sessionId', 'stream', 'metadata'],
              example: {
                model: 'gpt-4o',
                messages: [{role: 'user', content: 'What is the cap rate for this property?'}]
              }
            },
            {
              name: 'Responses API', 
              required: ['input OR messages'],
              optional: ['model', 'max_output_tokens', 'sessionId', 'stream', 'metadata'],
              examples: [
                {
                  model: 'gpt-5',
                  input: 'What is the cap rate for this property?'
                },
                {
                  model: 'gpt-5', 
                  messages: [{role: 'user', content: 'What is the cap rate for this property?'}]
                }
              ]
            }
          ],
          note: 'Never send null values - omit fields that have no value'
        },
        request_id: requestId
      })
    }
    
    // Move top-level documentId to metadata
    if (requestBody.documentId) {
      requestBody.metadata = requestBody.metadata || {}
      requestBody.metadata.documentId = requestBody.documentId
      delete requestBody.documentId
    }
    
    // Validate documentId format if provided
    if (requestBody.metadata?.documentId) {
      const docId = requestBody.metadata.documentId
      if (!docId.startsWith('mem-')) {
        structuredLog('warn', 'Invalid document ID format', {
          documentId: docId,
          userId,
          kvRead: false,
          status: 'invalid',
          request_id: requestId
        })
        return res.status(400).json({
          error: 'Invalid document ID format',
          code: 'INVALID_DOCUMENT_ID',
          details: 'Document ID must be a server-generated ID starting with "mem-". Use the documentId returned from the upload endpoint.',
          request_id: requestId
        })
      }
    }
    
    // Detect conflicts between messages and input
    if (requestBody.messages && requestBody.input) {
      return res.status(400).json({
        error: 'Cannot specify both messages and input',
        code: 'CONFLICTING_INPUT_FORMATS',
        details: 'Use either messages[] for Chat Completions API or input for Responses API, not both',
        request_id: requestId
      })
    }
    
    // Filter temperature for gpt-4.1 and Responses models
    const requestModel = requestBody.model || process.env.OPENAI_MODEL || 'gpt-4o'
    if ((requestModel.startsWith('gpt-4.1') || isResponsesModelUtil(requestModel)) && requestBody.temperature !== undefined) {
      delete requestBody.temperature
    }
    
    // Parse and validate request with Zod
    const parseResult = ChatRequestSchema.safeParse(requestBody)
    
    if (!parseResult.success) {
      // Extract validation errors for clear feedback
      const errors = parseResult.error.flatten()
      
      return res.status(400).json({ 
        error: 'Invalid request format',
        code: 'INVALID_REQUEST_FORMAT',
        details: {
          message: 'Request body validation failed. Please use Chat Completions or Responses API format.',
          allowed_formats: [
            {
              name: 'Chat Completions API',
              required: ['messages'],
              optional: ['model', 'max_tokens', 'sessionId', 'stream', 'metadata'],
              example: {
                model: 'gpt-4o',
                messages: [{role: 'user', content: 'What is the cap rate for this property?'}],
                sessionId: 'optional-session-id',
                stream: true
              }
            },
            {
              name: 'Responses API', 
              required: ['input OR messages'],
              optional: ['model', 'max_output_tokens', 'sessionId', 'stream', 'metadata'],
              examples: [
                {
                  model: 'gpt-5',
                  input: 'What is the cap rate for this property?',
                  sessionId: 'optional-session-id',
                  stream: true
                },
                {
                  model: 'gpt-5', 
                  messages: [{role: 'user', content: 'What is the cap rate for this property?'}],
                  sessionId: 'optional-session-id',
                  stream: true
                }
              ]
            }
          ],
          validation_errors: errors.fieldErrors,
          received: requestBody
        },
        request_id: requestId
      })
    }

    const validRequest = parseResult.data
    
    // Determine effective API family (auto-detect if not specified)
    let apiFamily: 'chat' | 'responses'
    let normalizedPath: 'chat-messages' | 'input-passthrough' | 'messages-to-input' | 'input-to-messages'
    
    if ('apiFamily' in validRequest && validRequest.apiFamily === 'responses') {
      apiFamily = 'responses'
    } else if ('apiFamily' in validRequest && validRequest.apiFamily === 'chat') {
      apiFamily = 'chat'
    } else {
      // Auto-detect based on model or request structure
      const requestModel = validRequest.model || process.env.OPENAI_MODEL
      
      // Only use responses API if explicitly indicated
      if (requestModel && isResponsesModelUtil(requestModel)) {
        apiFamily = 'responses'
      } else if ('input' in validRequest || 'max_output_tokens' in validRequest) {
        apiFamily = 'responses'
      } else {
        // Default to chat completions for standard requests
        apiFamily = 'chat'
      }
    }

    // Correlation ID already extracted at function start
    
    // Normalize request data based on API family
    let messages: Message[] = []
    let max_output_tokens: number | undefined
    let model: string
    let sessionId: string | undefined
    let payload: any // Declare payload early for error handling
    
    if (apiFamily === 'responses') {
      const responsesReq = validRequest as z.infer<typeof ResponsesAPISchema> | z.infer<typeof AutoDetectSchema>
      model = responsesReq.model || process.env.OPENAI_MODEL || process.env.OPENAI_FALLBACK_MODEL || 'gpt-5'
      sessionId = responsesReq.sessionId
      max_output_tokens = Math.min(responsesReq.max_output_tokens || 600, 600) // Cap at 600 tokens
      
      if (responsesReq.messages) {
        // Convert messages to internal format
        messages = responsesReq.messages
        normalizedPath = 'messages-to-input'
      } else if (responsesReq.input) {
        // Convert input to messages format for internal processing
        if (typeof responsesReq.input === 'string') {
          messages = [{ role: 'user', content: responsesReq.input }]
          normalizedPath = 'input-to-messages'
        } else {
          // Array of parts - convert to messages
          messages = responsesReq.input.map(part => ({
            role: part.role || 'user',
            content: part.text
          }))
          normalizedPath = 'input-passthrough'
        }
      } else {
        // This shouldn't happen due to refine validation, but handle it defensively
        return res.status(400).json({
          error: 'Either input or messages required for Responses API',
          code: 'MISSING_INPUT',
          request_id: requestId
        })
      }
    } else {
      // Chat Completions API
      const chatReq = validRequest as z.infer<typeof ChatCompletionSchema> | z.infer<typeof AutoDetectSchema>
      messages = chatReq.messages!
      model = chatReq.model || process.env.OPENAI_MODEL || process.env.OPENAI_FALLBACK_MODEL || 'gpt-4o-2024-08-06'
      sessionId = chatReq.sessionId
      max_output_tokens = 'max_tokens' in chatReq ? Math.min(chatReq.max_tokens || 600, 600) : 600 // Cap at 600 tokens
      normalizedPath = 'chat-messages'
    }

    // Document context augmentation with fast path for deal points
    if (requestBody.metadata?.documentId) {
      const documentId = requestBody.metadata.documentId
      const latestUser = [...messages].reverse().find(m => m.role === 'user')
      const userQuery = latestUser?.content || ''
      
      // Fast path: Check for deal points intent and cached results
      if (isDealPointsQuery(userQuery)) {
        const docHash = await getDocumentHash(documentId, userId)
        if (docHash) {
          const dealPointsKey = `dealPoints:${docHash}`
          const cachedDealPoints = await kvStore.getItem(dealPointsKey)
          
          if (cachedDealPoints && cachedDealPoints.bullets && cachedDealPoints.bullets.length > 0) {
            structuredLog('info', 'Fast path cache hit for deal points', {
              correlationId,
              documentId,
              userId,
              contentHash: docHash,
              cacheHit: true,
              bulletsCount: cachedDealPoints.bullets.length,
              request_id: requestId
            })
            
            // Format cached results as bullet list with page citations
            let fastPathResponse = '## Key Deal Points\n\n'
            for (let i = 0; i < cachedDealPoints.bullets.length; i++) {
              const bullet = cachedDealPoints.bullets[i]
              const citation = cachedDealPoints.citations?.[i]
              const pageRef = citation?.page ? ` (Page ${citation.page})` : ''
              fastPathResponse += `• ${bullet}${pageRef}\n`
            }
            
            // Add metadata footer
            fastPathResponse += `\n*Source: ${cachedDealPoints.source || 'document analysis'}*`
            
            // Set X-Text-Bytes header for fallback gating
            const responseBytes = new TextEncoder().encode(fastPathResponse).length
            res.setHeader('X-Text-Bytes', responseBytes.toString())
            
            // Non-blocking fire-and-forget persistence
            if (sessionId) {
              setImmediate(async () => {
                try {
                  const supabase = getSupabaseAdmin()
                  await supabase.from('messages').insert({
                    chat_session_id: sessionId,
                    role: 'assistant',
                    content: fastPathResponse,
                    metadata: { 
                      requestId, 
                      correlationId,
                      model: 'fast-path-cache',
                      apiFamily: 'cache',
                      source: 'dealPoints',
                      cacheHit: true,
                      contentHash: docHash
                    }
                  })
                } catch (persistErr) {
                  console.warn(`[${requestId}] Failed to persist fast path message:`, persistErr)
                }
              })
            }
            
            structuredLog('info', 'Fast path response completed', {
              correlationId,
              documentId,
              userId,
              contentLength: fastPathResponse.length,
              responseBytes,
              source: 'cache',
              request_id: requestId
            })
            
            return res.status(200).json({ 
              message: fastPathResponse,
              model: 'fast-path-cache',
              source: 'dealPoints',
              cacheHit: true,
              correlationId,
              request_id: requestId
            })
          }
        }
      }
      
      // Check status first
      const status = await kvStore.getStatus(documentId, userId)
      
      // Handle processing status with retries
      if (status.status === 'processing') {
        structuredLog('info', 'Document still processing, retrying', {
          documentId,
          userId,
          kvRead: true,
          status: 'processing',
          request_id: requestId
        })
        
        // Retry up to 3 times with 500ms delays
        for (let attempt = 1; attempt <= 3; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 500))
          const retryStatus = await kvStore.getStatus(documentId, userId)
          
          if (retryStatus.status === 'ready') {
            status.status = 'ready'
            break
          }
        }
        
        if (status.status === 'processing') {
          structuredLog('warn', 'Document still processing after retries', {
            documentId,
            userId,
            kvRead: true,
            status: 'processing',
            request_id: requestId
          })
          
          return res.status(409).json({
            error: 'Document still processing',
            code: 'DOCUMENT_PROCESSING',
            details: 'The document is still being processed. Please try again in a moment.',
            documentId,
            status: 'processing',
            request_id: requestId
          })
        }
      }
      
      // Handle error or missing status
      if (status.status === 'error' || status.status === 'missing') {
        structuredLog('error', 'Document context not available', {
          documentId,
          userId,
          kvRead: true,
          status: status.status,
          error: status.error,
          request_id: requestId
        })
        
        return res.status(409).json({
          error: 'Document context not found',
          code: 'DOCUMENT_CONTEXT_NOT_FOUND',
          details: status.status === 'error' 
            ? `Document processing failed: ${status.error || 'Unknown error'}`
            : 'The specified document context is not available. It may have expired or was not properly uploaded.',
          documentId,
          status: status.status,
          request_id: requestId
        })
      }
      
      // Retrieve chunks from KV (reduced to 3 for performance)
      const chunks = await retrieveTopK({
        documentId,
        query: latestUser?.content || '',
        k: 3,
        maxCharsPerChunk: 1000,
        userId, // Pass userId for security check
        docHash: (await getDocumentHash(documentId, userId)) || undefined // For cache coherence
      })

      // Context gating: return 424 when no chunks found to prevent AI hallucination
      if (!chunks.length) {
        structuredLog('warn', 'No chunks found - context unavailable', {
          documentId,
          userId,
          kvRead: true,
          status: 'empty',
          request_id: requestId
        })
        
        return res.status(424).json({
          error: 'context_unavailable',
          code: 'CONTEXT_UNAVAILABLE',
          message: 'PDF context is not available for this request. Please try again in a moment.',
          documentId,
          retryAfterMs: 1500,
          request_id: requestId
        })
      } else {
        structuredLog('info', 'Document chunks retrieved', {
          documentId,
          userId,
          kvRead: true,
          status: 'ready',
          parts: status.parts || 1,
          request_id: requestId
        })
        
        const augmented = augmentMessagesWithContext(chunks, messages)
        messages = apiFamily === 'chat' ? augmented.chat : augmented.responses
      }
    }

    // Enhanced structured logging with correlation ID
    structuredLog('info', 'Chat request initiated', {
      correlationId,
      documentId: requestBody.metadata?.documentId,
      userId: req.user?.id || 'anonymous',
      apiFamily,
      model,
      path: normalizedPath,
      messages_count: messages.length,
      max_output_tokens: max_output_tokens || 'default',
      sessionId: sessionId || 'none',
      hasDocumentId: !!(requestBody.metadata?.documentId),
      streamEnabled: true,
      messageRoles: messages.map(m => m.role),
      firstMessageLength: messages[0]?.content?.length || 0,
      request_id: requestId
    })

    // Ensure structured output system message is present
    if (!messages.some(m => m.role === 'system')) {
      messages.unshift(STRUCTURED_OUTPUT_SYSTEM_MESSAGE)
    }
    
    // Model cascade for deal points queries when fast path cache miss
    let cascadeResult: any = null
    const latestUser = [...messages].reverse().find(m => m.role === 'user')
    const isDeepAnalysisQuery = isDealPointsQuery(latestUser?.content || '') && requestBody.metadata?.documentId
    
    if (isDeepAnalysisQuery) {
      try {
        // Stage A: Fast extraction with gpt-4o-mini in parallel with any remaining retrieval
        const stageAPayload = {
          model: 'gpt-4o-mini',
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          response_format: { 
            type: 'json_schema' as const,
            json_schema: {
              name: 'deal_points_extraction',
              strict: true,
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['bullets', 'citations', 'confidence', 'schema_version'],
                properties: {
                  bullets: { 
                    type: 'array', 
                    minItems: 1,
                    items: { type: 'string', minLength: 1 }
                  },
                  citations: {
                    type: 'array',
                    minItems: 0,
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['page', 'text'],
                      properties: {
                        page: { type: 'number', minimum: 1 },
                        text: { type: 'string', minLength: 1 }
                      }
                    }
                  },
                  confidence: { type: 'boolean' },
                  distinctPages: { type: 'number', minimum: 0 },
                  schema_version: { type: 'string', enum: ['v1.0'] }
                }
              }
            }
          },
          max_tokens: 350,
          temperature: 0.1
        }
        
        const startTime = Date.now()
        let stageAResult
        try {
          fixResponseFormat(stageAPayload)
          stageAResult = await createChatCompletion(stageAPayload, { signal })
        } catch (schemaError: any) {
          // Fast-fail on 4xx schema validation errors - jump to fallback
          if (schemaError.status === 400 || schemaError.message?.includes('schema')) {
            structuredLog('warn', 'Stage A schema validation failed - routing to fallback', {
              correlationId,
              documentId: requestBody.metadata?.documentId,
              userId,
              error: schemaError.message,
              request_id: requestId
            })
            
            // Clear primary timeout and start fallback budget  
            clearTimeout(primaryTimeout)
            const fallbackController = new AbortController()
            const fallbackTimeout = setTimeout(() => fallbackController.abort(), 4000) // 4s fallback budget
            
            try {
              const fallbackResult = await runTextFallback(
                payload, messages, apiFamily, 'schema_error', fallbackController.signal
              )
              clearTimeout(fallbackTimeout)
              
              outcome = 'fallback'
              failure_cause = 'schema_error'
              
              // Set response and return early
              res.setHeader('X-Text-Bytes', new TextEncoder().encode(fallbackResult.content).length.toString())
              return res.status(200).json({
                message: fallbackResult.content,
                model: fallbackResult.model,
                usage: fallbackResult.usage,
                fallback_reason: 'schema_error',
                correlationId,
                request_id: requestId
              })
            } catch (fallbackError) {
              clearTimeout(fallbackTimeout)
              throw fallbackError // Let main error handler deal with this
            }
          }
          // Re-throw other errors to main handler
          throw schemaError
        }
        const stageATime = Date.now() - startTime
        
        if (stageAResult.content) {
          try {
            const parsed = JSON.parse(stageAResult.content)
            const distinctPages = parsed.distinctPages || (parsed.citations?.length || 0)
            
            structuredLog('info', 'Stage A completed', {
              correlationId,
              documentId: requestBody.metadata?.documentId,
              userId,
              stageATime,
              distinctPages,
              bulletsCount: parsed.bullets?.length || 0,
              confidence: parsed.confidence,
              request_id: requestId
            })
            
            // Stage B gating: only run if Stage A cites <3 distinct pages
            if (distinctPages < 3 && parsed.confidence !== false) {
              // Stage B: Verification with main model
              const stageBMessages = [
                ...messages,
                {
                  role: 'user' as const,
                  content: `Based on the document analysis, verify and refine these extracted deal points:\n\n${JSON.stringify(parsed, null, 2)}\n\nProvide a clean bullet list with page numbers. Be concise and factual.`
                }
              ]
              
              const stageBPayload = apiFamily === 'responses'
                ? buildResponses({ 
                    model, 
                    input: stageBMessages.map(m => ({ content: m.content, role: m.role })), 
                    max_output_tokens: Math.min(max_output_tokens || 400, 400)
                  })
                : buildChatCompletion({ model, messages: stageBMessages, max_tokens: Math.min(max_output_tokens || 400, 400) })
              
              stageBPayload.stream = false

              const stageBStart = Date.now()
              fixResponseFormat(stageBPayload)
              const stageBResult = await createChatCompletion(stageBPayload, { signal })
              const stageBTime = Date.now() - stageBStart
              
              if (stageBResult.content?.trim()) {
                cascadeResult = {
                  content: stageBResult.content,
                  model: stageBResult.model || model,
                  usage: {
                    total_tokens: (stageAResult.usage?.total_tokens || 0) + (stageBResult.usage?.total_tokens || 0),
                    prompt_tokens: (stageAResult.usage?.prompt_tokens || 0) + (stageBResult.usage?.prompt_tokens || 0),
                    completion_tokens: (stageAResult.usage?.completion_tokens || 0) + (stageBResult.usage?.completion_tokens || 0)
                  },
                  cascade: {
                    stageA: { time: stageATime, model: 'gpt-4o-mini', distinctPages },
                    stageB: { time: stageBTime, model: stageBResult.model || model }
                  }
                }
                
                structuredLog('info', 'Stage B completed', {
                  correlationId,
                  documentId: requestBody.metadata?.documentId,
                  userId,
                  stageBTime,
                  totalCascadeTime: stageATime + stageBTime,
                  contentLength: stageBResult.content.length,
                  request_id: requestId
                })
              }
            } else {
              // Use Stage A result directly (sufficient distinct pages or low confidence)
              let stageAResponse = '## Key Deal Points\n\n'
              if (parsed.bullets && Array.isArray(parsed.bullets)) {
                for (let i = 0; i < parsed.bullets.length; i++) {
                  const bullet = parsed.bullets[i]
                  const citation = parsed.citations?.[i]
                  const pageRef = citation?.page ? ` (Page ${citation.page})` : ''
                  stageAResponse += `• ${bullet}${pageRef}\n`
                }
              }
              
              cascadeResult = {
                content: stageAResponse,
                model: 'gpt-4o-mini',
                usage: stageAResult.usage,
                cascade: {
                  stageA: { time: stageATime, model: 'gpt-4o-mini', distinctPages },
                  stageBSkipped: 'sufficient_pages_or_low_confidence'
                }
              }
              
              structuredLog('info', 'Stage B skipped', {
                correlationId,
                documentId: requestBody.metadata?.documentId,
                userId,
                reason: distinctPages >= 3 ? 'sufficient_pages' : 'low_confidence',
                distinctPages,
                totalTime: stageATime,
                request_id: requestId
              })
            }
          } catch (parseError) {
            structuredLog('warn', 'Stage A JSON parse failed - routing to fallback', {
              correlationId,
              documentId: requestBody.metadata?.documentId,
              userId,
              error: parseError instanceof Error ? parseError.message : 'Unknown error',
              request_id: requestId
            })
            
            // Clear primary timeout and start fallback budget
            clearTimeout(primaryTimeout)
            const fallbackController = new AbortController()
            const fallbackTimeout = setTimeout(() => fallbackController.abort(), 4000) // 4s fallback budget
            
            try {
              const fallbackResult = await runTextFallback(
                payload, messages, apiFamily, 'json_parse', fallbackController.signal
              )
              clearTimeout(fallbackTimeout)
              
              outcome = 'fallback'
              failure_cause = 'json_parse'
              
              // Set response and return early
              res.setHeader('X-Text-Bytes', new TextEncoder().encode(fallbackResult.content).length.toString())
              return res.status(200).json({
                message: fallbackResult.content,
                model: fallbackResult.model,
                usage: fallbackResult.usage,
                fallback_reason: 'json_parse',
                correlationId,
                request_id: requestId
              })
            } catch (fallbackError) {
              clearTimeout(fallbackTimeout)
              throw fallbackError // Let main error handler deal with this
            }
          }
        }
      } catch (cascadeError) {
        structuredLog('error', 'Model cascade failed', {
          correlationId,
          documentId: requestBody.metadata?.documentId,
          userId,
          error: cascadeError instanceof Error ? cascadeError.message : 'Unknown error',
          request_id: requestId
        })
      }
    }
    
    // If cascade produced result, use it
    if (cascadeResult) {
      // Set X-Text-Bytes header for fallback gating
      const responseBytes = new TextEncoder().encode(cascadeResult.content).length
      res.setHeader('X-Text-Bytes', responseBytes.toString())
      
      // Non-blocking fire-and-forget persistence
      if (sessionId) {
        setImmediate(async () => {
          try {
            const supabase = getSupabaseAdmin()
            await supabase.from('messages').insert({
              chat_session_id: sessionId,
              role: 'assistant',
              content: cascadeResult.content,
              metadata: { 
                requestId, 
                correlationId,
                usage: cascadeResult.usage, 
                model: cascadeResult.model,
                apiFamily: 'cascade',
                cascade: cascadeResult.cascade
              }
            })
          } catch (persistErr) {
            console.warn(`[${requestId}] Failed to persist cascade message:`, persistErr)
          }
        })
      }
      
      structuredLog('info', 'Model cascade completed', {
        correlationId,
        documentId: requestBody.metadata?.documentId,
        userId,
        model: cascadeResult.model,
        usage: cascadeResult.usage,
        cascade: cascadeResult.cascade,
        contentLength: cascadeResult.content.length,
        request_id: requestId
      })
      
      return res.status(200).json({ 
        message: cascadeResult.content,
        model: cascadeResult.model,
        usage: cascadeResult.usage,
        cascade: cascadeResult.cascade,
        correlationId,
        request_id: requestId
      })
    }
    
    // Build request for selected API family with streaming enabled
    payload = apiFamily === 'responses'
      ? buildResponses({ 
          model, 
          input: messages.map(m => ({ content: m.content, role: m.role })), 
          max_output_tokens 
        })
      : buildChatCompletion({ model, messages, max_tokens: max_output_tokens })
    
    // Configure for user-facing responses: enable tools but ensure text output
    payload.stream = true
    payload.response_format = { type: 'text' }
    // Keep tools enabled but add natural language requirement in system message

    // Set complete SSE headers for streaming
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Cache-Control, Content-Type, X-Correlation-ID')
    res.setHeader('Access-Control-Expose-Headers', 'X-Correlation-ID')
    res.setHeader('X-Accel-Buffering', 'no') // Disable nginx buffering
    res.setHeader('X-Correlation-ID', correlationId)
    res.setHeader('Vary', 'Authorization, Cookie')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
    
    // Call OpenAI with proper error handling and performance monitoring
    const callStartTime = Date.now()
    fixResponseFormat(payload)
    const ai = await createChatCompletion(payload, { signal })
    const firstTokenTime = Date.now() - callStartTime
    
    // Guard against null/undefined AI response properties
    if (!ai || typeof ai !== 'object') {
      throw new Error('Invalid AI response: received null or non-object response')
    }
    
    // Performance budget monitoring (tightened thresholds)
    if (firstTokenTime > 1500) {
      structuredLog('warn', 'PERF_BUDGET_WARNING', {
        correlationId,
        documentId: requestBody.metadata?.documentId,
        userId,
        t_first_token: firstTokenTime,
        budget_target: 1200,
        threshold_warning: 1500,
        request_id: requestId
      })
    }
    
    if (firstTokenTime > 2000) {
      structuredLog('error', 'PERF_BUDGET_MISS', {
        correlationId,
        documentId: requestBody.metadata?.documentId,
        userId,
        t_first_token: firstTokenTime,
        budget_target: 1200,
        threshold_error: 2000,
        request_id: requestId
      })
    }
    
    // Check for tool-only responses (empty text content)
    const hadText = !!(ai?.content && ai.content.trim().length > 0)
    const hadToolCalls = !!((ai as any)?.tool_calls && (ai as any).tool_calls.length > 0)
    
    // Handle empty-text fallback for tool-only responses
    if (!hadText && hadToolCalls) {
      structuredLog('info', 'Tool-only response detected, generating fallback text', {
        correlationId,
        documentId: requestBody.metadata?.documentId,
        userId: req.user?.id || 'anonymous',
        model,
        hadToolCalls: true,
        hadText: false,
        request_id: requestId
      })
      
      // Build fallback request with same context
      const fallbackPayload = apiFamily === 'responses'
        ? buildResponses({ 
            model, 
            input: messages.map(m => ({ content: m.content, role: m.role })), 
            max_output_tokens: Math.min(max_output_tokens || 600, 600)
          })
        : buildChatCompletion({ model, messages, max_tokens: Math.min(max_output_tokens || 600, 600) })
      
      // Force text output and disable tools if present
      if (fallbackPayload.tools && Array.isArray(fallbackPayload.tools) && fallbackPayload.tools.length > 0) {
        fallbackPayload.tool_choice = 'none'
      }
      fallbackPayload.stream = false

      try {
        fixResponseFormat(fallbackPayload)
        const fallbackAi = await createChatCompletion(fallbackPayload, { signal })
        
        if (fallbackAi?.content && fallbackAi.content.trim().length > 0) {
          structuredLog('info', 'Fallback text generated successfully', {
            correlationId,
            documentId: requestBody.metadata?.documentId,
            userId: req.user?.id || 'anonymous',
            fallbackContentLength: fallbackAi.content.length,
            request_id: requestId
          })
          
          // Use fallback content
          ai.content = fallbackAi.content || ''
          ;(ai as any).finish_reason = 'fallback_text'
        }
      } catch (fallbackError) {
        structuredLog('error', 'Fallback text generation failed', {
          correlationId,
          documentId: requestBody.metadata?.documentId,
          userId: req.user?.id || 'anonymous',
          error: fallbackError instanceof Error ? fallbackError.message : 'Unknown error',
          request_id: requestId
        })
        // Continue with original response
      }
    }

    // Set X-Text-Bytes header for fallback gating
    const responseBytes = new TextEncoder().encode(ai?.content || '').length
    res.setHeader('X-Text-Bytes', responseBytes.toString())
    
    // Check for empty content after completion - route to fallback instead of 502
    const hasToolCalls = !!((ai as any)?.tool_calls && (ai as any).tool_calls.length > 0)
    if ((!ai?.content || ai.content.trim().length === 0) && !hasToolCalls && !signal.aborted) {
      structuredLog('warn', 'Empty content detected - routing to fallback', {
        correlationId,
        documentId: requestBody.metadata?.documentId,
        userId: req.user?.id || 'anonymous',
        model: ai?.model || 'unknown',
        finish_reason: (ai as any)?.finish_reason || 'unknown',
        hasToolCalls,
        request_id: requestId
      })
      
      // Clear primary timeout and start fallback budget
      clearTimeout(primaryTimeout)
      const fallbackController = new AbortController()
      const fallbackTimeout = setTimeout(() => fallbackController.abort(), 4000) // 4s fallback budget
      
      try {
        const fallbackResult = await runTextFallback(
          payload, messages, apiFamily, 'empty_content', fallbackController.signal
        )
        clearTimeout(fallbackTimeout)
        
        outcome = 'fallback'
        failure_cause = 'empty_content'
        
        // Use fallback content and continue with response
        ai.content = fallbackResult.content || ''
        ai.model = fallbackResult.model || model
        ai.usage = fallbackResult.usage || {}
        ;(ai as any).fallback_reason = 'empty_content'
      } catch (fallbackError) {
        clearTimeout(fallbackTimeout)
        // If fallback also fails, return 502
        return res.status(502).json({
          error: 'empty_text',
          code: 'EMPTY_RESPONSE',
          message: 'The AI response was empty and fallback failed. Please try again.',
          request_id: requestId
        })
      }
    }
    
    // Send response first
    const response = res.status(200).json({ 
      message: ai?.content || '',
      model: ai?.model || model,
      usage: ai?.usage || {},
      correlationId,
      request_id: requestId
    })
    
    // Fire-and-forget persistence (non-blocking)
    if (sessionId) {
      setImmediate(async () => {
        try {
          const supabase = getSupabaseAdmin()
          await supabase.from('messages').insert({
            chat_session_id: sessionId,
            role: 'assistant',
            content: ai?.content || '',
            metadata: { 
              requestId, 
              correlationId,
              usage: ai?.usage || {}, 
              model: ai?.model || model,
              apiFamily,
              path: normalizedPath,
              finish_reason: (ai as any)?.finish_reason || 'unknown',
              hadToolCalls: !!((ai as any)?.tool_calls && (ai as any).tool_calls.length > 0),
              hadText: !!(ai?.content && ai.content.trim().length > 0),
              fallback_reason: (ai as any)?.fallback_reason
            }
          })
        } catch (persistErr) {
          console.warn(`[${requestId}] Failed to persist chat message:`, persistErr)
        }
      })
    }
    
    // Log successful completion
    structuredLog('info', 'Chat request completed', {
      documentId: requestBody?.metadata?.documentId,
      userId,
      outcome,
      failure_cause,
      latency_ms: Date.now() - startTime,
      correlationId,
      request_id: requestId
    })
    
    return response
    
  } catch (error: any) {
    // Handle Zod errors that might occur during processing
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid request data',
        code: 'VALIDATION_ERROR',
        details: error.flatten().fieldErrors,
        request_id: requestId
      })
    }
    
    // Enhanced error logging with correlation ID
    const finalCorrelationId = correlationId || requestId
    structuredLog('error', 'Chat request failed', {
      correlationId: finalCorrelationId,
      documentId: requestBody?.metadata?.documentId,
      userId: req.user?.id || 'anonymous',
      error: error?.message,
      status: error?.status,
      code: error?.code,
      type: error?.type,
      request_id: requestId,
      ...(process.env.NODE_ENV === 'development' && { stack: error?.stack })
    })
    
    // Determine if this is an upstream OpenAI error (return 502) or client error (return 4xx)
    const isUpstreamError = error?.status >= 500 || 
                           error?.message?.includes('OpenAI') ||
                           error?.message?.includes('timeout') ||
                           error?.message?.includes('ETIMEDOUT')
    
    const statusCode = isUpstreamError ? 502 : (error?.status || 500)
    const errorType = isUpstreamError ? 'UPSTREAM_ERROR' : (error?.code || 'CHAT_ERROR')
    
    // Determine if timeout caused this error
    if (signal.aborted || error?.name === 'AbortError') {
      outcome = 'fallback'
      failure_cause = 'timeout'
    } else {
      outcome = 'fallback'  
      failure_cause = 'error'
    }
    
    // Log failure before returning error response
    structuredLog('error', 'Chat request failed', {
      documentId: requestBody?.metadata?.documentId,
      userId,
      outcome,
      failure_cause,
      latency_ms: Date.now() - startTime,
      correlationId,
      request_id: requestId
    })

    return res.status(statusCode).json({ 
      code: errorType,
      type: error?.type || 'api_error',
      message: error?.message || 'Chat processing failed',
      correlationId: finalCorrelationId,
      request_id: error?.request_id || requestId
    })
  } finally {
    // Clean up timeout
    clearTimeout(primaryTimeout)
  }
}

// Compose middleware: auth first, then rate limiting
// Each middleware returns a (req, res) => Promise<void> function
export default withRateLimit({ 
  id: 'chat', 
  tokens: 20, 
  windowMs: 60000 
})(withAuth(chatHandler))