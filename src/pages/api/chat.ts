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
import { callOpenAIWithFallback } from '@/lib/services/openai/client-wrapper'
import { getModelConfiguration, validateRequestModel, generateRequestId as generateReqId, getTokenParamForModel, selectTokenParam } from '@/lib/config/validate-models'
import * as Sentry from '@sentry/nextjs'
import crypto from 'crypto'

// System message for structured output
const STRUCTURED_OUTPUT_SYSTEM_MESSAGE = {
  role: 'system' as const,
  content: 'You are a helpful assistant for commercial real estate analysis. Always provide clear, structured responses using markdown formatting. Use short headings (## or ###), bold lead phrases for key points, and bullet lists where appropriate. Always include a brief natural-language answer even when tools are used. Be concise but thorough, and limit responses to essential information.'
}

// Runtime controlled by vercel.json

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
  // Parse body early to support feature flags and routing decisions
  let requestBody: any = req.body ?? {}

  // Kill switch: Route to conversational endpoint when flag is enabled
  if (process.env.CONVERSATIONAL_CHAT === '1') {
    const modelHint = requestBody.model || ''
    const usesResponsesApi = requestBody.input !== undefined || (typeof modelHint === 'string' && isResponsesModelUtil(modelHint))
    if (!usesResponsesApi) {
      const { default: conversationalHandler } = await import('./chat-conversational')
      return conversationalHandler(req, res)
    }
  }

  // GUARANTEED: Generate single requestId for entire request lifecycle - NEVER regenerate
  const requestId = generateReqId('chat')
  const userId = req.user?.id || 'anonymous'
  let correlationId: string = (req.headers['x-correlation-id'] as string) || requestId
  let completed = false  // Track successful completion
  
  // Create AbortController for this request with production timeout
  const abortController = new AbortController()
  const primaryTimeout = setTimeout(() => abortController.abort(), 10000) // 10s production timeout
  const signal = abortController.signal
  
  // Track timing and outcomes for terminal logging
  const startTime = Date.now()
  let outcome: 'primary' | 'fallback' | 'cache_hit' = 'primary'
  let failure_cause: string | undefined
  
  try {
    // VALIDATION: Method check with structured error response
    if (req.method !== 'POST') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      return res.status(405).json({ 
        code: 'METHOD_NOT_ALLOWED',
        message: 'Only POST method is allowed for this endpoint',
        requestId: requestId
      })
    }

    // VALIDATION: Require non-empty message content
    if (!requestBody.messages || !Array.isArray(requestBody.messages) || requestBody.messages.length === 0) {
      if (!requestBody.input || (typeof requestBody.input === 'string' && !requestBody.input.trim())) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        return res.status(400).json({
          code: 'BAD_REQUEST',
          message: 'Request must include non-empty messages array or input string',
          requestId: requestId
        })
      }
    }
    
    // Check for empty message content in messages array
    if (requestBody.messages && Array.isArray(requestBody.messages)) {
      const hasEmptyMessage = requestBody.messages.some((msg: any) => 
        !msg.content || (typeof msg.content === 'string' && !msg.content.trim())
      )
      if (hasEmptyMessage) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        return res.status(400).json({
          code: 'BAD_REQUEST', 
          message: 'All messages must have non-empty content',
          requestId: requestId
        })
      }
    }
    
    // Reject legacy {message} format - require proper schema
    if (requestBody.message && typeof requestBody.message === 'string') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      return res.status(400).json({
        code: 'INVALID_REQUEST_FORMAT',
        message: 'Legacy {message: string} format is not supported. Use Chat Completions or Responses API format.',
        requestId: requestId
      })
    }
    
    // Explicitly reject null sessionId
    if (requestBody.sessionId === null) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      return res.status(400).json({
        code: 'INVALID_REQUEST_FORMAT',
        message: 'sessionId cannot be null. Either omit the field or provide a valid string value.',
        requestId: requestId
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
          requestId: requestId
        })
        return res.status(400).json({
          error: 'Invalid document ID format',
          code: 'INVALID_DOCUMENT_ID',
          details: 'Document ID must be a server-generated ID starting with "mem-". Use the documentId returned from the upload endpoint.',
          requestId: requestId
        })
      }
    }
    
    // Detect conflicts between messages and input
    if (requestBody.messages && requestBody.input) {
      return res.status(400).json({
        error: 'Cannot specify both messages and input',
        code: 'CONFLICTING_INPUT_FORMATS',
        details: 'Use either messages[] for Chat Completions API or input for Responses API, not both',
        requestId: requestId
      })
    }
    
    // Get model configuration
    const modelConfig = getModelConfiguration()

    // Use configured model or request-specific model
    const requestModel = requestBody.model || modelConfig.main

    // Upfront model validation - fail fast on unsupported models
    const modelValidation = validateRequestModel(requestModel)
    if (!modelValidation.valid) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      return res.status(400).json({
        code: 'MODEL_UNAVAILABLE',
        message: modelValidation.error || `Model '${requestModel}' is not supported`,
        requestId: requestId
      })
    }

    // Log configuration if debugging
    if (process.env.DEBUG_MODELS === 'true') {
      console.log('[MODEL_CONFIG]', {
        configured: modelConfig,
        requested: requestModel,
        validation: modelValidation,
        requestId: requestId
      })
    }

    // Filter temperature for gpt-4.1 and Responses models
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
        requestId: requestId
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
      const requestModel = validRequest.model || modelConfig.main
      
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
      model = responsesReq.model || modelConfig.main
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
          requestId: requestId
        })
      }
    } else {
      // Chat Completions API
      const chatReq = validRequest as z.infer<typeof ChatCompletionSchema> | z.infer<typeof AutoDetectSchema>
      messages = chatReq.messages!
      model = chatReq.model || modelConfig.main
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
              requestId: requestId
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
              requestId: requestId
            })
            
            return res.status(200).json({ 
              message: fastPathResponse,
              model: 'fast-path-cache',
              source: 'dealPoints',
              cacheHit: true,
              correlationId,
              requestId: requestId
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
          requestId: requestId
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
            requestId: requestId
          })
          
          return res.status(409).json({
            error: 'Document still processing',
            code: 'DOCUMENT_PROCESSING',
            details: 'The document is still being processed. Please try again in a moment.',
            documentId,
            status: 'processing',
            requestId: requestId
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
          requestId: requestId
        })
        
        return res.status(409).json({
          error: 'Document context not found',
          code: 'DOCUMENT_CONTEXT_NOT_FOUND',
          details: status.status === 'error' 
            ? `Document processing failed: ${status.error || 'Unknown error'}`
            : 'The specified document context is not available. It may have expired or was not properly uploaded.',
          documentId,
          status: status.status,
          requestId: requestId
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
          requestId: requestId
        })
        
        return res.status(424).json({
          error: 'context_unavailable',
          code: 'CONTEXT_UNAVAILABLE',
          message: 'PDF context is not available for this request. Please try again in a moment.',
          documentId,
          retryAfterMs: 1500,
          requestId: requestId
        })
      } else {
        structuredLog('info', 'Document chunks retrieved', {
          documentId,
          userId,
          kvRead: true,
          status: 'ready',
          parts: status.parts || 1,
          requestId: requestId
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
      requestId: requestId
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
              requestId: requestId
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
                requestId: requestId
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
              requestId: requestId
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
                  requestId: requestId
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
                requestId: requestId
              })
            }
          } catch (parseError) {
            structuredLog('warn', 'Stage A JSON parse failed - routing to fallback', {
              correlationId,
              documentId: requestBody.metadata?.documentId,
              userId,
              error: parseError instanceof Error ? parseError.message : 'Unknown error',
              requestId: requestId
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
                requestId: requestId
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
          requestId: requestId
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
        requestId: requestId
      })
      
      return res.status(200).json({ 
        message: cascadeResult.content,
        model: cascadeResult.model,
        usage: cascadeResult.usage,
        cascade: cascadeResult.cascade,
        correlationId,
        requestId: requestId
      })
    }
    
    // Build request for selected API family with streaming toggle
    payload = apiFamily === 'responses'
      ? buildResponses({ 
          model, 
          input: messages.map(m => ({ content: m.content, role: m.role })), 
          max_output_tokens 
        })
      : buildChatCompletion({ model, messages, max_tokens: max_output_tokens })
    
    // Configure streaming based on environment toggle
    const enableStreaming = process.env.OPENAI_STREAM !== 'false'
    payload.stream = enableStreaming
    payload.response_format = { type: 'text' }
    // Keep tools enabled but add natural language requirement in system message

    // Do not set headers until after successful upstream connection
    
    // Call OpenAI with comprehensive error handling
    const callStartTime = Date.now()
    let ai: any
    let didStreamSucceed = false
    
    try {
      fixResponseFormat(payload)
      ai = await createChatCompletion(payload, { 
        signal: abortController.signal,
        requestId: requestId  // GUARANTEED: Pass requestId to prevent regeneration
      })
      const firstTokenTime = Date.now() - callStartTime
    
      // Guard against null/undefined AI response properties
      if (!ai || typeof ai !== 'object') {
        throw new Error('Invalid AI response: received null or non-object response')
      }
      
      // Check if we got successful content
      if (ai?.content && ai.content.trim().length > 0) {
        didStreamSucceed = true
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
        requestId: requestId
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
        requestId: requestId
      })
    }
    
    // Check for tool-only responses (empty text content)
    const hadText = !!(ai?.content && ai.content.trim().length > 0)
    const hadToolCalls = !!((ai as any)?.tool_calls && (ai as any).tool_calls.length > 0)
    
    // Handle empty-text fallback for tool-only responses (only if stream didn't succeed)
    if (!didStreamSucceed && !hadText && hadToolCalls) {
      structuredLog('info', 'Tool-only response detected, generating fallback text', {
        correlationId,
        documentId: requestBody.metadata?.documentId,
        userId: req.user?.id || 'anonymous',
        model,
        hadToolCalls: true,
        hadText: false,
        requestId: requestId
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
            requestId: requestId
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
          requestId: requestId
        })
        // Continue with original response
      }
    }

    // Set X-Text-Bytes header for fallback gating
    const responseBytes = new TextEncoder().encode(ai?.content || '').length
    res.setHeader('X-Text-Bytes', responseBytes.toString())
    
    // Check for empty content after completion - route to fallback instead of 502 (only if stream didn't succeed)
    const hasToolCalls = !!((ai as any)?.tool_calls && (ai as any).tool_calls.length > 0)
    if (!didStreamSucceed && (!ai?.content || ai.content.trim().length === 0) && !hasToolCalls && !signal.aborted) {
      structuredLog('warn', 'Empty content detected - routing to fallback', {
        correlationId,
        documentId: requestBody.metadata?.documentId,
        userId: req.user?.id || 'anonymous',
        model: ai?.model || 'unknown',
        finish_reason: (ai as any)?.finish_reason || 'unknown',
        hasToolCalls,
        requestId: requestId
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
          requestId: requestId
        })
      }
    }
    
    // SUCCESS PATHS: JSON only for now to avoid SSE/JSON header mixing
    // Set JSON headers only - no SSE headers to prevent corruption
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    res.setHeader('X-Correlation-ID', correlationId)
    
    res.status(200).json({ 
      message: ai?.content || '',
      model: ai?.model || model,
      usage: ai?.usage || {},
      correlationId,
      requestId: requestId  // Standardized key
    })
    completed = true  // MARK: Set only after JSON response is sent
    
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
      requestId: requestId
    })
    
    } catch (openAIError: any) {
      // Handle OpenAI-specific errors with structured responses
      clearTimeout(primaryTimeout)
      
      // HEADERS: Set Content-Type for error responses only if not already sent
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
      }
      
      // Log the OpenAI error
      structuredLog('error', 'OpenAI API call failed', {
        correlationId,
        documentId: requestBody?.metadata?.documentId,
        userId,
        model: requestModel,
        error: openAIError?.message,
        status: openAIError?.status,
        code: openAIError?.code,
        type: openAIError?.type,
        requestId: requestId
      })
      
      // CRITICAL: Check if headers already sent (mid-stream error)
      if (res.headersSent) {
        if (!res.writableEnded && !res.destroyed) {
          try {
            res.write(`event: error\n`)
            res.write(`data: ${JSON.stringify({
              code: openAIError?.code || 'UPSTREAM_ERROR',
              message: openAIError?.message || 'AI service error',
              requestId: requestId
            })}\n\n`)
            res.end()
          } catch (writeError) {
            // Write failed, just return
          }
        }
        return
      }
      
      // Pre-stream error - safe to send JSON
      // Map OpenAI errors to structured responses
      if (openAIError?.status === 401 || openAIError?.status === 403) {
        return res.status(502).json({
          code: 'UPSTREAM_AUTH',
          message: 'Authentication failed with AI service. Please check your API configuration.',
          requestId: requestId
        })
      }
      
      if (openAIError?.status === 404 || (openAIError?.status === 400 && openAIError?.message?.includes('model'))) {
        return res.status(400).json({
          code: 'MODEL_UNAVAILABLE', 
          message: `Model '${requestModel}' is not available or accessible. Please try a different model.`,
          requestId: requestId
        })
      }
      
      if (openAIError?.status === 429) {
        return res.status(502).json({
          code: 'UPSTREAM_ERROR',
          message: 'AI service is currently rate limited. Please try again in a moment.',
          requestId: requestId
        })
      }
      
      if (openAIError?.status >= 500 || openAIError?.name === 'AbortError' || signal.aborted) {
        return res.status(502).json({
          code: 'UPSTREAM_ERROR',
          message: signal.aborted ? 'Request timeout - please try again with a shorter message.' : 'AI service is temporarily unavailable. Please try again.',
          requestId: requestId
        })
      }
      
      // Generic upstream error
      return res.status(502).json({
        code: 'UPSTREAM_ERROR',
        message: 'AI service error occurred. Please try again.',
        requestId: requestId
      })
    }
    
  } catch (error: any) {
    // CRITICAL: Check if headers already sent before attempting JSON response
    if (res.headersSent) {
      // Mid-stream error - emit SSE error event only if writable
      if (!res.writableEnded && !res.destroyed) {
        try {
          res.write(`event: error\n`)
          res.write(`data: ${JSON.stringify({
            code: error.code || 'UPSTREAM_ERROR',
            message: error.message || 'Service error',
            requestId: requestId
          })}\n\n`)
          res.end()
        } catch (writeError) {
          // Write failed, connection already closed
        }
      }
      return
    }
    
    // Pre-stream error - safe to send JSON
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    
    // Safe Sentry tagging with requestId, model, and tokenParam
    Sentry.withScope((scope) => {
      scope.setTag('requestId', requestId)
      scope.setTag('model', requestBody?.model || getModelConfiguration().main)
      
      // Safe tokenParam handling
      if (error.code === 'MODEL_UNAVAILABLE') {
        scope.setTag('tokenParam', 'n/a')
      } else {
        try {
          const modelToCheck = requestBody?.model || getModelConfiguration().main
          scope.setTag('tokenParam', selectTokenParam(modelToCheck).paramKey)
        } catch (e) {
          scope.setTag('tokenParam', 'error')
        }
      }
      
      Sentry.captureException(error)
    })
    
    // Handle Zod errors that might occur during processing
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        code: 'BAD_REQUEST',
        message: 'Request validation failed',
        requestId: requestId
      })
    }
    
    // Handle structured errors with proper status codes
    if (error.code) {
      const status = error.code === 'MODEL_UNAVAILABLE' ? 400 : 502
      return res.status(status).json({
        code: error.code,
        message: error.message || 'Service error',
        requestId: error.requestId || requestId
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
      requestId: requestId,
      ...(process.env.NODE_ENV === 'development' && { stack: error?.stack })
    })
    
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
      requestId: requestId
    })

    return res.status(502).json({ 
      code: 'UPSTREAM_ERROR',
      message: error?.message || 'AI service temporarily unavailable',
      requestId: requestId
    })
  } finally {
    // CONDITIONAL: Only abort if not completed successfully
    if (!completed) {
      abortController.abort()
    }
    // Always clear timeout
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