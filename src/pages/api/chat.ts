import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { withAuth, withRateLimit, type AuthenticatedRequest } from '@/lib/auth-middleware'
import { createChatCompletion, fixResponseFormat } from '@/lib/services/openai'
import { jsonError } from '@/lib/chat/errors'
import { chatCompletion as buildChatCompletion, responses as buildResponses } from '@/lib/services/openai/builders'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { isChatModel, isResponsesModel as isResponsesModelUtil } from '@/lib/services/openai/modelUtils'
import { retrieveTopK } from '@/lib/rag/retriever'
import { augmentMessagesWithContext } from '@/lib/rag/augment'
import * as kvStore from '@/lib/kv-store'
import { structuredLog, generateRequestId } from '@/lib/log'
import { callOpenAIWithFallback } from '@/lib/services/openai/client-wrapper'
import { getModelConfiguration, validateRequestModel, generateRequestId as generateReqId, getTokenParamForModel, selectTokenParam, getTokenParam } from '@/lib/config/validate-models'
import { classifyIntent, isComparisonQuery } from '@/lib/chat/intent-classifier'
import { computeRequiredParts, calculateRetryAfter } from '@/lib/utils/document-readiness'
import { normalizeMarkdownBullets } from '@/lib/utils/markdown-normalizer'
import * as Sentry from '@sentry/nextjs'
import crypto from 'crypto'

// System message for structured output
const STRUCTURED_OUTPUT_SYSTEM_MESSAGE = {
  role: 'system' as const,
  content: 'You are a helpful assistant for commercial real estate analysis. Always provide clear, structured responses using markdown formatting. Use short headings (## or ###), bold lead phrases for key points, and bullet lists where appropriate. Always include a brief natural-language answer even when tools are used. Be concise but thorough, and limit responses to essential information.'
}

// Runtime controlled by vercel.json

// Request counters for observability
let gatedRequestsCount = 0
let totalRequestsCount = 0

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
    documentId: z.string().optional(),
    documentIds: z.array(z.string()).optional(),
    compareDocumentId: z.string().optional(),
    requireDocumentContext: z.boolean().optional()
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
 * Internal text fallback helper - mirrors context and forces text output
 * Used when JSON parsing fails, content is empty, or schema validation fails
 */
async function runTextFallback(
  originalPayload: any,
  messages: Message[],
  apiFamily: 'chat' | 'responses',
  reason: 'json_parse' | 'timeout' | 'empty_content' | 'schema_error',
  signal: AbortSignal,
  requestId: string
): Promise<{content: string, model: string, usage: any, reason: string}> {
  // Resolve a safe model for fallback to avoid cascades on undefined/invalid models
  let resolvedModel = originalPayload?.model as string | undefined
  try {
    const validation = resolvedModel ? validateRequestModel(resolvedModel) : { valid: false }
    if (!validation.valid) {
      resolvedModel = getModelConfiguration().fast || 'gpt-4o-mini'
    }
  } catch {
    resolvedModel = 'gpt-4o-mini'
  }
  const fallbackTokenParams = getTokenParam(resolvedModel!, 600)
  const fallbackPayload = apiFamily === 'responses'
    ? buildResponses({
        model: originalPayload.model,
        input: messages.map(m => ({ content: m.content, role: m.role })),
        ...fallbackTokenParams
      })
    : buildChatCompletion({
        model: originalPayload.model,
        messages,
        ...fallbackTokenParams
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
  const fallbackResult = await createChatCompletion(fallbackPayload, { signal, requestId })

  return {
    content: fallbackResult.content || '',
    model: fallbackResult.model || originalPayload.model,
    usage: fallbackResult.usage,
    reason
  }
}


const MIN_PARTS = parseInt(process.env.MIN_PARTS || '5', 10)

/**
 * Chat endpoint handler that supports both Chat Completions and Responses API
 */
async function chatHandler(req: AuthenticatedRequest, res: NextApiResponse): Promise<void> {
  // Handle OPTIONS preflight for CORS
  if (req.method === 'OPTIONS') {
    // Echo origin if present, otherwise use wildcard
    const origin = req.headers.origin || '*'
    
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Request-ID, X-Correlation-ID, Authorization')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Max-Age', '86400')
    res.setHeader('Vary', 'Origin')
    
    res.status(200).end()
    return
  }

  // GUARANTEED: Generate single requestId for entire request lifecycle - NEVER regenerate
  const requestIdHeader =
    (req.headers['x-request-id'] as string) ||
    (req.headers['x-correlation-id'] as string) ||
    (req.query.request_id as string) ||
    (req.query.requestId as string)
  const requestId = requestIdHeader || generateReqId('chat')
  if (!req.headers['x-request-id']) {
    req.headers['x-request-id'] = requestId
  }
  // Set response header to propagate requestId downstream
  res.setHeader('X-Request-ID', requestId)
  const userId = req.user?.id || 'anonymous'

  // Kill switch: Route to conversational endpoint when flag is enabled
  if (process.env.CONVERSATIONAL_CHAT === '1') {
    const { default: conversationalHandler } = await import('./chat-conversational')
    return conversationalHandler(req, res)
  }

  // Flagged path: delegate to refactored router when enabled
  if (process.env.CHAT_ROUTER === 'v2') {
    const { handle } = await import('@/lib/chat/router')
    const model = req.body?.model
    return handle(req, res, { requestId, userId, model })
  }
  let correlationId: string = (req.headers['x-correlation-id'] as string) || requestId
  let requestBody: any
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
      jsonError(res, 405, 'METHOD_NOT_ALLOWED', 'Only POST and OPTIONS methods are allowed', requestId, req)
      return
    }

    requestBody = req.body ?? {}
    
    // VALIDATION: Require non-empty message content
    if (!requestBody.messages || !Array.isArray(requestBody.messages) || requestBody.messages.length === 0) {
      if (!requestBody.input || (typeof requestBody.input === 'string' && !requestBody.input.trim())) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        return res.status(400).json({
          error: {
            type: 'api_error',
            code: 'BAD_REQUEST',
            message: 'Request must include non-empty messages array or input string',
            requestId: requestId
          }
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
          error: {
            type: 'api_error',
            code: 'BAD_REQUEST',
            message: 'All messages must have non-empty content',
            requestId: requestId
          }
        })
      }
    }
    
    // Reject legacy {message} format - require proper schema
    if (requestBody.message && typeof requestBody.message === 'string') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      return res.status(400).json({
        error: {
          type: 'api_error',
          code: 'INVALID_REQUEST_FORMAT',
          message: 'Legacy {message: string} format is not supported. Use Chat Completions or Responses API format.',
          requestId: requestId
        }
      })
    }
    
    // Explicitly reject null sessionId
    if (requestBody.sessionId === null) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      return res.status(400).json({
        error: {
          type: 'api_error',
          code: 'INVALID_REQUEST_FORMAT',
          message: 'sessionId cannot be null. Either omit the field or provide a valid string value.',
          requestId: requestId
        }
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

    const latestUser = [...messages].reverse().find(m => m.role === 'user')
    const userQuery = latestUser?.content || ''

    // Multi-document API support
    const documentIds = requestBody.metadata?.documentIds || 
      (requestBody.metadata?.documentId ? [requestBody.metadata.documentId] : [])
    const compareDocumentId = requestBody.metadata?.compareDocumentId
    
    // Handle comparison queries
    if (isComparisonQuery(userQuery)) {
      const allDocs = [...documentIds]
      if (compareDocumentId) allDocs.push(compareDocumentId)
      
      if (allDocs.length < 2) {
        return jsonError(res, 424, 'COMPARISON_REQUIRES_DOCS', 
          'Comparison requires multiple documents', requestId, req)
      }
    }

    // Intent classification with caching
    const hasDocumentId = documentIds.length > 0
    const clientOverride = requestBody.metadata?.requireDocumentContext
    const classification = classifyIntent(userQuery, hasDocumentId, clientOverride)
    
    // Increment total requests counter
    totalRequestsCount++
    
    // Log classification for observability
    structuredLog('info', 'Intent classification', {
      userId: req.user?.id || 'anonymous',
      query: userQuery.substring(0, 100),
      classification: classification.type,
      confidence: classification.confidence,
      hasDocumentId,
      clientOverride,
      detectedPatterns: classification.detectedPatterns,
      classificationTime: classification.classificationTime,
      totalRequests: totalRequestsCount,
      requestId
    })

    // Document context augmentation with fast path for deal points
    let status: any = null
    if (requestBody.metadata?.documentId) {
      const documentId = requestBody.metadata.documentId
      
      // Fast path: Check for deal points intent and cached results
      if (isDealPointsQuery(userQuery)) {
        // Get status first to check for contentHash
        const statusForCache = await kvStore.getStatus(documentId, userId)
        const docHash = statusForCache.contentHash
        
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
              fastPathResponse += `- ${bullet}${pageRef}\n`
            }
            
            // Add metadata footer
            fastPathResponse += `\n*Source: ${cachedDealPoints.source || 'document analysis'}*`
            
            // Normalize cached content for consistent markdown rendering (read-time only)
            fastPathResponse = normalizeMarkdownBullets(fastPathResponse, requestId).content
            
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
      
      status = await kvStore.getStatus(documentId, userId)
      const requiredParts = computeRequiredParts(status.pagesIndexed || 0)
      if (status.status !== 'ready' || (status.parts || 0) < requiredParts) {
        if (status.status === 'processing' || (status.parts || 0) < requiredParts) {
          gatedRequestsCount++
          structuredLog('info', 'Document not ready - gating request', {
            documentId,
            userId,
            classification: 'document',
            confidence: classification.confidence,
            gating_reason: 'document_processing',
            parts: status.parts || 0,
            requiredParts,
            outcome: 'processing',
            gatedRequestsTotal: gatedRequestsCount,
            requestId
          })
          const retryAfter = calculateRetryAfter(status.parts || 0, requiredParts)
          res.setHeader('Retry-After', retryAfter.toString())
          return jsonError(res, 202, 'CONTEXT_PROCESSING', 'Document is still processing', requestId, req)
        }

        structuredLog('warn', 'Document context unavailable', {
          documentId,
          userId,
          status: status.status,
          outcome: 'context_unavailable',
          requestId
        })
        return jsonError(res, 424, 'CONTEXT_UNAVAILABLE', 'Document context not available', requestId, req)
      }
      
      // Retrieve chunks from KV (reduced to 3 for performance)
      const chunks = await retrieveTopK({
        documentId,
        query: latestUser?.content || '',
        k: 3,
        maxCharsPerChunk: 1000,
        userId, // Pass userId for security check
        docHash: status?.contentHash || undefined // For cache coherence
      })

      // Context gating: return 424 when no chunks found to prevent AI hallucination
      if (!chunks.length) {
        structuredLog('warn', 'No chunks found - context unavailable', {
          documentId,
          userId,
          kvRead: true,
          status: 'empty',
          outcome: 'context_unavailable',
          requestId: requestId
        })

        return jsonError(res, 424, 'CONTEXT_UNAVAILABLE', 'PDF context is not available for this request', requestId, req)
      } else {
        structuredLog('info', 'Document chunks retrieved', {
          documentId,
          userId,
          kvRead: true,
          status: 'ready',
          parts: status.parts || 1,
          outcome: 'ready',
          requestId: requestId
        })

        const augmented = augmentMessagesWithContext(chunks, messages)
        messages = apiFamily === 'chat' ? augmented.chat : augmented.responses
      }
    } else if (classification.type === 'document') {
      gatedRequestsCount++
      structuredLog('warn', 'Missing documentId for document query - gating request', {
        userId,
        classification: classification.type,
        confidence: classification.confidence,
        gating_reason: 'missing_document_id',
        detectedPatterns: classification.detectedPatterns,
        outcome: 'context_unavailable',
        gatedRequestsTotal: gatedRequestsCount,
        requestId
      })
      return jsonError(res, 424, 'CONTEXT_UNAVAILABLE', 'Document context required for this query', requestId, req)
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
    const latestUserPost = [...messages].reverse().find(m => m.role === 'user')
    const isDeepAnalysisQuery = isDealPointsQuery(latestUserPost?.content || '') && requestBody.metadata?.documentId
    
    if (isDeepAnalysisQuery) {
      try {
        // Stage A: Use primary model (gpt-5/gpt-4o) for strict JSON schema extraction
        const modelConfig = getModelConfiguration()
        const extractionModel = modelConfig.main || 'gpt-5'
        
        structuredLog('info', 'Starting Stage A with extraction model', {
          extractionModel,
          documentId: requestBody.metadata?.documentId,
          userId,
          requestId
        })
        
        // Prepare messages with strict JSON system prompt for gpt-5 (Responses API doesn't support response_format)
        const stageAMessages = [
          {
            role: 'system' as const,
            content: `You are a strict JSON generator. Always output only valid JSON matching this DEAL_POINTS_SCHEMA. No prose, no markdown, nothing outside JSON.

DEAL_POINTS_SCHEMA:
{
  "bullets": string[] (1-10 items, 10-500 chars each),
  "citations": Array<{page: number (1-1000), text: string (1-200 chars)}> (0-10 items),
  "confidence": boolean,
  "distinctPages": number (0-1000),
  "schema_version": "v1.0"
}

Output ONLY the JSON object, nothing else.`
          },
          ...messages.map(m => ({ role: m.role, content: m.content }))
        ]
        
        const stageAPayload = {
          model: extractionModel,
          messages: stageAMessages,
          // Note: response_format not supported by gpt-5 Responses API
          ...getTokenParam(extractionModel, 700),
          temperature: 0
        }
        
        const startTime = Date.now()
        let stageAResult
        try {
          fixResponseFormat(stageAPayload)
          stageAResult = await createChatCompletion(stageAPayload, { signal, requestId })
          
          // Robust JSON extraction from model output
          function extractFirstJSONObject(s: string): string | null {
            let inStr = false, esc = false, depth = 0, start = -1;
            for (let i = 0; i < s.length; i++) {
              const c = s[i];
              if (inStr) {
                if (!esc && c === '"') inStr = false;
                esc = c === '\\' ? !esc : false;
                continue;
              }
              if (c === '"') { inStr = true; continue; }
              if (c === '{') {
                if (depth === 0) start = i;
                depth++;
              } else if (c === '}') {
                depth--;
                if (depth === 0 && start !== -1) return s.slice(start, i + 1);
              }
            }
            return null;
          }

          const raw = typeof stageAResult?.content === 'string' ? stageAResult.content.trim() : '';
          if (!raw) {
            structuredLog('error', 'Deal points extraction returned empty content', { 
              requestId, 
              model: extractionModel,
              correlationId,
              documentId: requestBody.metadata?.documentId,
              userId
            });
            return res.status(422).json({ 
              code: 'PARSE_ERROR', 
              message: 'Deal points extraction failed: Empty response', 
              requestId 
            });
          }

          const jsonBlock = extractFirstJSONObject(raw);
          if (!jsonBlock) {
            structuredLog('error', 'No JSON object found in model output', { 
              requestId, 
              model: extractionModel,
              correlationId,
              documentId: requestBody.metadata?.documentId,
              userId,
              content_preview: raw.substring(0, 200)
            });
            return res.status(422).json({ 
              code: 'PARSE_ERROR', 
              message: 'Deal points extraction failed: No JSON object found', 
              requestId 
            });
          }

          let parsed: any;
          try {
            parsed = JSON.parse(jsonBlock);
          } catch (e: any) {
            structuredLog('error', 'JSON parse failed', { 
              requestId, 
              model: extractionModel,
              correlationId,
              documentId: requestBody.metadata?.documentId,
              userId,
              error: e?.message,
              json_preview: jsonBlock.substring(0, 200)
            });
            return res.status(422).json({ 
              code: 'PARSE_ERROR', 
              message: 'Deal points extraction failed: Invalid JSON syntax', 
              requestId 
            });
          }

          // Schema validation - allow empty arrays but validate structure
          if (!parsed || typeof parsed !== 'object' ||
              !('bullets' in parsed) || !Array.isArray(parsed.bullets) ||
              !('confidence' in parsed) || typeof parsed.confidence !== 'boolean' ||
              !('schema_version' in parsed)) {
            structuredLog('error', 'Schema validation failed', { 
              requestId, 
              model: extractionModel,
              correlationId,
              documentId: requestBody.metadata?.documentId,
              userId,
              parsed_keys: Object.keys(parsed || {})
            });
            return res.status(422).json({ 
              code: 'PARSE_ERROR', 
              message: 'Deal points extraction failed: Invalid schema', 
              requestId 
            });
          }

          // Hand off validated JSON to downstream processing
          stageAResult.content = JSON.stringify(parsed);
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
                payload, messages, apiFamily, 'schema_error', fallbackController.signal, requestId
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
              
              const stageBTokenParams = getTokenParam(model, Math.min(max_output_tokens || 400, 400))
              const stageBPayload = apiFamily === 'responses'
                ? buildResponses({ 
                    model, 
                    input: stageBMessages.map(m => ({ content: m.content, role: m.role })), 
                    ...stageBTokenParams
                  })
                : buildChatCompletion({ model, messages: stageBMessages, ...stageBTokenParams })
              
              stageBPayload.stream = false

              const stageBStart = Date.now()
              fixResponseFormat(stageBPayload)
              const stageBResult = await createChatCompletion(stageBPayload, { signal, requestId })
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
                    stageA: { time: stageATime, model: extractionModel, distinctPages },
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
                  // Normalize individual bullet content to remove Unicode bullets
                  let bullet = parsed.bullets[i]
                  if (typeof bullet === 'string' && /^[•●▪▫◦‣⁃]\s*/.test(bullet)) {
                    bullet = bullet.replace(/^[•●▪▫◦‣⁃]\s*/, '')
                  }
                  
                  const citation = parsed.citations?.[i]
                  const pageRef = citation?.page ? ` (Page ${citation.page})` : ''
                  stageAResponse += `- ${bullet}${pageRef}\n`
                }
              }
              
              // Normalize Stage A response for consistent markdown rendering
              stageAResponse = normalizeMarkdownBullets(stageAResponse, requestId).content
              
              cascadeResult = {
                content: stageAResponse,
                model: extractionModel,
                usage: stageAResult.usage,
                cascade: {
                  stageA: { time: stageATime, model: extractionModel, distinctPages },
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
                payload, messages, apiFamily, 'json_parse', fallbackController.signal, requestId
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
      // Normalize cascade content for consistent markdown rendering
      const normalizedCascadeContent = normalizeMarkdownBullets(cascadeResult.content, requestId).content
      
      // Set X-Text-Bytes header for fallback gating
      const responseBytes = new TextEncoder().encode(normalizedCascadeContent).length
      res.setHeader('X-Text-Bytes', responseBytes.toString())
      
      // Non-blocking fire-and-forget persistence
      if (sessionId) {
        setImmediate(async () => {
          try {
            const supabase = getSupabaseAdmin()
            await supabase.from('messages').insert({
              chat_session_id: sessionId,
              role: 'assistant',
              content: normalizedCascadeContent,
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
        contentLength: normalizedCascadeContent.length,
        requestId: requestId
      })
      
      return res.status(200).json({ 
        message: normalizedCascadeContent,
        model: cascadeResult.model,
        usage: cascadeResult.usage,
        cascade: cascadeResult.cascade,
        correlationId,
        requestId: requestId
      })
    }
    
    // Build request for selected API family with streaming toggle
    const tokenParams = getTokenParam(model, max_output_tokens)
    payload = apiFamily === 'responses'
      ? buildResponses({ 
          model, 
          input: messages.map(m => ({ content: m.content, role: m.role })), 
          ...tokenParams
        })
      : buildChatCompletion({ model, messages, ...tokenParams })
    
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
      const fallbackTokenParams = getTokenParam(model, Math.min(max_output_tokens || 600, 600))
      const fallbackPayload = apiFamily === 'responses'
        ? buildResponses({ 
            model, 
            input: messages.map(m => ({ content: m.content, role: m.role })), 
            ...fallbackTokenParams
          })
        : buildChatCompletion({ model, messages, ...fallbackTokenParams })
      
      // Force text output and disable tools if present
      if (fallbackPayload.tools && Array.isArray(fallbackPayload.tools) && fallbackPayload.tools.length > 0) {
        fallbackPayload.tool_choice = 'none'
      }
      fallbackPayload.stream = false

      try {
        fixResponseFormat(fallbackPayload)
        const fallbackAi = await createChatCompletion(fallbackPayload, { signal, requestId })
        
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
          payload, messages, apiFamily, 'empty_content', fallbackController.signal, requestId
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
    
    // Ensure we have valid content with retry logic
    let retryCount = 0;
    while ((!ai?.content || ai.content.trim().length === 0) && retryCount < 1) {
      retryCount++;
      structuredLog('warn', 'Empty response - retrying', { userId, requestId, model: ai?.model || model, attempt: retryCount + 1 });
      try {
        ai = await createChatCompletion(payload, { signal, requestId });
        if (ai?.content && ai.content.trim().length > 0) break;
      } catch (retryError) {
        structuredLog('error', 'Retry failed', { error: retryError?.message, requestId });
      }
    }

    if (!ai?.content || ai.content.trim().length === 0) {
      return res.status(200).json({
        message: 'I apologize, but I could not generate a response. Please try rephrasing your question.',
        code: 'EMPTY_RESPONSE',
        model: ai?.model || model,
        requestId: requestId
      });
    }

    // Normalize final content for consistent markdown rendering
    const finalContent = normalizeMarkdownBullets(ai.content, requestId).content

    res.status(200).json({
      message: finalContent,
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
      outcome: 'success',
      parts: status?.parts || 0,
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
    
    // Handle MISSING_REQUEST_ID error specifically
    if (error?.code === 'MISSING_REQUEST_ID') {
      res.setHeader('x-request-id', requestId)
      return jsonError(res, 500, error.code, error.message || 'Request ID is required', requestId, req)
    }
    
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
