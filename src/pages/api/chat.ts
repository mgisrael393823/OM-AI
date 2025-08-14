import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { withAuth, withRateLimit, type AuthenticatedRequest } from '@/lib/auth-middleware'
import { createChatCompletion } from '@/lib/services/openai'
import { chatCompletion as buildChatCompletion, responses as buildResponses } from '@/lib/services/openai/builders'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isChatModel, isResponsesModel as isResponsesModelUtil } from '@/lib/services/openai/modelUtils'
import { retrieveTopK } from '@/lib/rag/retriever'
import { augmentMessagesWithContext } from '@/lib/rag/augment'

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

/**
 * Chat endpoint handler that supports both Chat Completions and Responses API
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

    let requestBody = req.body ?? {}
    
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

    // Normalize request data based on API family
    let messages: Message[] = []
    let max_output_tokens: number | undefined
    let model: string
    let sessionId: string | undefined
    
    if (apiFamily === 'responses') {
      const responsesReq = validRequest as z.infer<typeof ResponsesAPISchema> | z.infer<typeof AutoDetectSchema>
      model = responsesReq.model || process.env.OPENAI_MODEL || process.env.OPENAI_FALLBACK_MODEL || 'gpt-5'
      sessionId = responsesReq.sessionId
      max_output_tokens = responsesReq.max_output_tokens
      
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
      max_output_tokens = 'max_tokens' in chatReq ? chatReq.max_tokens : undefined
      normalizedPath = 'chat-messages'
    }

    // Document context augmentation
    if (requestBody.metadata?.documentId) {
      const latestUser = [...messages].reverse().find(m => m.role === 'user')
      const chunks = await retrieveTopK({
        documentId: requestBody.metadata.documentId,
        query: latestUser?.content || '',
        k: 8,
        maxCharsPerChunk: 1000
      })

      if (!chunks.length) {
        // Check if this is a mem-* ID that should have context
        if (requestBody.metadata.documentId.startsWith('mem-')) {
          const allowWithoutContext = process.env.ALLOW_CHAT_WITHOUT_CONTEXT === 'true'
          
          if (!allowWithoutContext) {
            console.error(`[chat] Document context not found for ${requestBody.metadata.documentId} - returning 409`, {
              documentId: requestBody.metadata.documentId,
              allowWithoutContext,
              runtime: 'nodejs',
              pid: process.pid
            })
            
            return res.status(409).json({
              error: 'Document context not found',
              code: 'DOCUMENT_CONTEXT_NOT_FOUND',
              details: 'The specified document context is not available. It may have expired or was not properly uploaded.',
              documentId: requestBody.metadata.documentId,
              request_id: requestId
            })
          } else {
            console.warn(`[chat] No document context found for ${requestBody.metadata.documentId}; continuing without augmentation (ALLOW_CHAT_WITHOUT_CONTEXT=true)`, {
              documentId: requestBody.metadata.documentId,
              runtime: 'nodejs',
              pid: process.pid
            })
          }
        } else {
          console.warn(`[chat] No document context found for ${requestBody.metadata.documentId}; continuing without augmentation`, {
            documentId: requestBody.metadata.documentId,
            runtime: 'nodejs',
            pid: process.pid
          })
        }
      } else {
        console.log(`[chat] Found ${chunks.length} document chunks for context augmentation`, {
          documentId: requestBody.metadata.documentId,
          chunkCount: chunks.length,
          contextSource: requestBody.metadata.documentId.startsWith('mem-') ? 'transient' : 'database',
          runtime: 'nodejs',
          pid: process.pid
        })
        
        const augmented = augmentMessagesWithContext(chunks, messages)
        messages = apiFamily === 'chat' ? augmented.chat : augmented.responses
      }
    }

    // Log structured information about the request
    console.log(`[chat] Request ${requestId}:`, {
      schemaMatched: apiFamily === 'chat' ? 'ChatCompletionSchema' : 'ResponsesAPISchema',
      userId: req.user?.id || 'anonymous',
      apiFamily,
      model,
      path: normalizedPath,
      messages_count: messages.length,
      max_output_tokens: max_output_tokens || 'default',
      sessionId: sessionId || 'none',
      runtime: 'nodejs',
      pid: process.pid,
      // Sanitized fields (no sensitive content)
      sanitized: {
        hasDocumentId: !!(requestBody.metadata?.documentId),
        streamEnabled: !!requestBody.stream,
        messageRoles: messages.map(m => m.role),
        firstMessageLength: messages[0]?.content?.length || 0
      }
    })

    // Build request for selected API family
    const payload = apiFamily === 'responses'
      ? buildResponses({ 
          model, 
          input: messages.map(m => ({ content: m.content, role: m.role })), 
          max_output_tokens 
        })
      : buildChatCompletion({ model, messages, max_tokens: max_output_tokens })

    // Call OpenAI with proper error handling
    const ai = await createChatCompletion(payload)

    // Best-effort persistence (non-fatal on error)
    if (sessionId) {
      try {
        await supabaseAdmin.from('messages').insert({
          chat_session_id: sessionId,
          role: 'assistant',
          content: ai.content,
          metadata: { 
            requestId, 
            usage: ai.usage, 
            model: ai.model,
            apiFamily,
            path: normalizedPath
          }
        })
      } catch (persistErr) {
        console.warn(`[${requestId}] Failed to persist chat message:`, persistErr)
      }
    }

    return res.status(200).json({ 
      message: ai.content,
      model: ai.model,
      usage: ai.usage,
      request_id: requestId
    })
    
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