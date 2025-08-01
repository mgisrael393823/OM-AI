import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { withAuth, withRateLimit, AuthenticatedRequest } from '@/lib/auth-middleware'
import { ERROR_CODES, createApiError } from '@/lib/constants/errors'
import { openai, isOpenAIConfigured } from '@/lib/openai-client'
import { checkEnvironment, getConfig } from '@/lib/config'
import { logError } from '@/lib/error-logger'
import { getOmPrompt, CURRENT_OM_PROMPT_VERSION } from '@/lib/prompts/om-analyst'
import { getConversationalPrompt } from '@/lib/prompts/conversational'
import { getOmNaturalPrompt } from '@/lib/prompts/om-analyst-natural'
import { detectIntent, suggestResponseFormat, ChatIntent } from '@/lib/utils/intent-detection'
import { validateAndFilterOmResponse, createEmptyOMResponse } from '@/lib/validation/om-response'
import omSummarySchema from '@/lib/validation/om-schema.json'
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
    return createApiError(res, ERROR_CODES.METHOD_NOT_ALLOWED)
  }

  // Validate environment at runtime (non-blocking)
  const validation = checkEnvironment()
  if (!validation.isValid) {
    console.warn("Environment validation warnings:", validation.errors)
  }

  // Check if OpenAI is properly configured
  if (!isOpenAIConfigured()) {
    return createApiError(res, ERROR_CODES.OPENAI_NOT_CONFIGURED,
      "OpenAI API key is not configured. Please contact support.")
  }

  // Normalize and validate request format
  const normalizedRequest = normalizeRequest(req.body)
  const hasMessage = 'message' in req.body
  const hasMessages = 'messages' in req.body
  const hasOptions = 'options' in req.body
  const hasDocumentContext = 'documentContext' in req.body
  
  // Simple format: has message field (with optional sessionId, documentId, options for compatibility)
  // Complex format: has messages array field
  // If neither, default to simple format for better error messages
  const isSimple = hasMessage || !hasMessages

  // Validate request format
  if (isSimple) {
    if (!normalizedRequest.message) {
      return createApiError(res, ERROR_CODES.MISSING_MESSAGE)
    }
  } else {
    if (!normalizedRequest.messages || !Array.isArray(normalizedRequest.messages)) {
      return createApiError(res, ERROR_CODES.INVALID_MESSAGES)
    }
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
    return createApiError(res, ERROR_CODES.RATE_LIMIT_EXCEEDED)
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
        return createApiError(res, ERROR_CODES.SESSION_ERROR, sessionError.message)
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
        return createApiError(res, ERROR_CODES.SESSION_NOT_FOUND)
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
        
        // Get document chunks - try without text search first to ensure we get content
        const { data: allChunks, error: allChunksError } = await supabase
          .from('document_chunks')
          .select(`
            content,
            page_number,
            chunk_type,
            documents!inner(original_filename)
          `)
          .eq('user_id', req.user.id)
          .in('document_id', documentIds)
          .limit(10)
        
        if (allChunksError) {
          console.error('Error retrieving document chunks:', allChunksError)
        }
        
        // Now try with text search if we have chunks and a query
        let relevantChunks = allChunks
        if (allChunks && allChunks.length > 0 && userQuery) {
          const { data: searchChunks, error: searchError } = await supabase
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
          
          if (searchError) {
            console.error('Error in document text search:', searchError)
          }
          
          // Use search results if available, otherwise fall back to all chunks
          if (searchChunks && searchChunks.length > 0) {
            relevantChunks = searchChunks
          }
        }

        if (relevantChunks && relevantChunks.length > 0) {
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

    // Detect user intent to determine appropriate response format
    const userMessage = isSimple ? normalizedRequest.message! : 
      messages[messages.length - 1]?.content || "";
    
    const hasDocContext = !!contextualInformation || documentIds.length > 0;
    const intentAnalysis = detectIntent(userMessage, hasDocContext, messages);
    const responseFormat = suggestResponseFormat(intentAnalysis);
    
    // Select appropriate system prompt based on intent
    let systemPrompt: string;
    let useJsonSchema = false;
    
    if (intentAnalysis.intent === ChatIntent.JSON_REQUEST) {
      // User explicitly wants JSON
      systemPrompt = getOmPrompt(CURRENT_OM_PROMPT_VERSION);
      useJsonSchema = true;
    } else if (intentAnalysis.intent === ChatIntent.DOCUMENT_ANALYSIS && hasDocContext) {
      // Document analysis with natural language output
      systemPrompt = getOmNaturalPrompt(intentAnalysis.analysisType || 'full');
    } else {
      // General conversation
      systemPrompt = getConversationalPrompt(hasDocContext);
    }
    
    const systemMessage = {
      role: "system" as const,
      content: contextualInformation ? `${systemPrompt}\n\nDOCUMENT CONTEXT:\n${contextualInformation}` : systemPrompt
    }

    // Use SSE format for deprecated endpoints or when explicitly requested
    const useSSEFormat = !!deprecatedEndpoint
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

      // Create streaming response with optional structured outputs
      let response;
      
      if (useJsonSchema) {
        response = await openai.chat.completions.create({
          model: normalizedRequest.options?.model || "gpt-4o",
          messages: [systemMessage, ...messages],
          temperature: normalizedRequest.options?.temperature || 0.7,
          max_tokens: normalizedRequest.options?.maxTokens || 2000,
          stream: true,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'om_analysis',
              schema: omSummarySchema,
              strict: true
            }
          }
        });
      } else {
        response = await openai.chat.completions.create({
          model: normalizedRequest.options?.model || "gpt-4o",
          messages: [systemMessage, ...messages],
          temperature: normalizedRequest.options?.temperature || 0.7,
          max_tokens: normalizedRequest.options?.maxTokens || 2000,
          stream: true
        });
      }

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

      // Validate structured response only if JSON was requested
      let validatedResponse = assistantResponse;
      if (useJsonSchema && assistantResponse) {
        try {
          const parsedResponse = JSON.parse(assistantResponse);
          const validation = validateAndFilterOmResponse(parsedResponse);
          
          if (!validation.success) {
            console.warn('OM Response validation failed (streaming):', validation.errors);
            // For streaming, we already sent the response, so just log the issue
          }
        } catch (parseError) {
          console.warn('Failed to parse streaming JSON response:', parseError);
        }
      }

      // Save assistant response if we have a session
      if (sessionId && validatedResponse) {
        await supabase.from('messages').insert({
          chat_session_id: sessionId,
          role: 'assistant',
          content: validatedResponse,
          prompt_version: CURRENT_OM_PROMPT_VERSION
        })

        await supabase.from('chat_sessions')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', sessionId)
      }

      res.end()
    } else {
      // Non-streaming response with optional structured outputs
      let response;
      
      if (useJsonSchema) {
        response = await openai.chat.completions.create({
          model: normalizedRequest.options?.model || "gpt-4o",
          messages: [systemMessage, ...messages],
          temperature: normalizedRequest.options?.temperature || 0.7,
          max_tokens: normalizedRequest.options?.maxTokens || 2000,
          stream: false,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'om_analysis',
              schema: omSummarySchema,
              strict: true
            }
          }
        });
      } else {
        response = await openai.chat.completions.create({
          model: normalizedRequest.options?.model || "gpt-4o",
          messages: [systemMessage, ...messages],
          temperature: normalizedRequest.options?.temperature || 0.7,
          max_tokens: normalizedRequest.options?.maxTokens || 2000,
          stream: false
        });
      }

      const assistantContent = response.choices[0]?.message?.content || ""

      // Validate and filter structured response only if JSON was requested
      let validatedContent = assistantContent;
      let validationWarnings: string[] = [];
      
      if (useJsonSchema && assistantContent) {
        try {
          const parsedResponse = JSON.parse(assistantContent);
          const validation = validateAndFilterOmResponse(parsedResponse);
          
          if (validation.success && validation.data) {
            validatedContent = JSON.stringify(validation.data);
          } else {
            console.warn('OM Response validation failed (non-streaming):', validation.errors);
            validationWarnings = validation.errors || [];
            // Fallback to empty response if validation fails
            const emptyResponse = createEmptyOMResponse();
            validatedContent = JSON.stringify(emptyResponse);
          }
        } catch (parseError) {
          console.error('Failed to parse non-streaming JSON response:', parseError);
          // Fallback to empty response
          const emptyResponse = createEmptyOMResponse();
          validatedContent = JSON.stringify(emptyResponse);
          validationWarnings = ['Failed to parse JSON response'];
        }
      }

      // Save messages if we have a session
      if (sessionId) {
        await supabase.from('messages').insert({
          chat_session_id: sessionId,
          role: 'assistant',
          content: validatedContent,
          prompt_version: CURRENT_OM_PROMPT_VERSION,
          token_usage: response.usage ? JSON.stringify(response.usage) : null
        })

        await supabase.from('chat_sessions')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', sessionId)
      }

      res.status(200).json({
        id: response.id,
        content: validatedContent,
        model: response.model,
        usage: response.usage,
        sessionId,
        ...(validationWarnings.length > 0 && { validationWarnings })
      })
    }

  } catch (error) {
    logError(error, {
      endpoint: '/api/chat',
      userId: req.user.id,
      errorType: 'CHAT_ERROR'
    })
    
    if (!res.headersSent) {
      return createApiError(res, ERROR_CODES.OPENAI_ERROR,
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
