import type { NextApiRequest, NextApiResponse } from 'next'
import { OpenAI } from 'openai'
import { z } from 'zod'
import { ELITE_OM_ADVISOR_PROMPT } from '@/lib/prompts/elite-om-advisor'
import { getRelevantChunks } from '@/lib/rag/conversational-retriever'
import { withAuth, AuthenticatedRequest } from '@/lib/auth-middleware'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { WEB_TOOLS_FUNCTIONS } from '@/lib/services/web-tools/tool-definitions'
import { executeWebToolsFunction, formatWebToolsResponse, resetToolBudget } from '@/lib/services/web-tools/function-handler'

// KV storage for recent documents
let kvStore: any = null
try {
  const { kv } = require('@vercel/kv')
  kvStore = kv
} catch (error) {
  console.log('[chat-conversational] KV not available, using fallback')
}

// Maximum runtime for the entire conversation endpoint
const MAX_MS = Number(process.env.CONV_MAX_RUN_MS ?? 60000) // 1 minute default

export const config = {
  api: { 
    bodyParser: { sizeLimit: '1mb' },
    responseLimit: false
  },
  runtime: 'nodejs',
  maxDuration: 60
}

// Validation schema
const ChatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string()
  })).min(1).max(50),
  documentId: z.string().optional(),
  sessionId: z.string().optional(),
  context: z.object({
    docIds: z.array(z.string()).optional()
  }).optional()
})

// Document ID validation
function isValidDocumentId(id: string): boolean {
  return id.startsWith('mem-') || /^[0-9a-fA-F-]{36}$/.test(id)
}

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  // Kill switch
  if (process.env.CONVERSATIONAL_CHAT !== '1') {
    const { default: legacyHandler } = await import('./chat')
    return legacyHandler(req, res)
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const validation = ChatSchema.safeParse(req.body)
  if (!validation.success) {
    return res.status(400).json({ error: 'Invalid request' })
  }

  const { messages, documentId, context } = validation.data
  const safeDocId = documentId && isValidDocumentId(documentId) ? documentId : undefined

  // SSE headers with immediate flush
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.setHeader('Vary', 'Authorization, Cookie')
  res.flushHeaders?.()
  // No manual sentinels - pipe OpenAI Responses SSE stream as-is

  // Environment-configurable heartbeat and watchdog
  const heartbeatMs = Number(process.env.HEARTBEAT_MS) || 25000
  const ttfbGuardMs = Number(process.env.TTFB_GUARD_MS) || 0
  
  const heartbeat = setInterval(() => res.write(':hb\n\n'), heartbeatMs);
  const ttfbGuard = ttfbGuardMs > 0 ? setTimeout(() => res.write('data: {"content":"..."}\n\n'), ttfbGuardMs) : null;
  
  const cleanup = () => {
    clearInterval(heartbeat);
    if (ttfbGuard) clearTimeout(ttfbGuard);
  };
  req.on('close', cleanup);
  
  // Skip progress indicator - start directly with content

  try {
    // Resolve document IDs for context
    let resolvedDocIds: string[] = []
    
    if (context?.docIds?.length) {
      // Use provided docIds
      resolvedDocIds = context.docIds.filter(id => isValidDocumentId(id))
    } else if (safeDocId) {
      // Use legacy documentId
      resolvedDocIds = [safeDocId]
    } else {
      // Fallback to recent documents
      resolvedDocIds = await getRecentDocuments(req.user.id) || []
    }

    // Get document context
    let documentContext = ''
    if (resolvedDocIds.length > 0) {
      const chunks = await getRelevantChunks(resolvedDocIds[0], messages, req.user.id)
      if (chunks?.length) {
        documentContext = '\n\nDocument context:\n' + 
          chunks.map(c => `[Page ${c.page}] ${c.content}`).join('\n')
        
        // Context cap
        const MAX_CONTEXT_CHARS = 24000;
        documentContext = documentContext.slice(0, MAX_CONTEXT_CHARS);
      }
    }

    // Prepare function tools if web tools are enabled
    const webToolsEnabled = process.env.NEXT_FEATURE_WEB_TOOLS === 'true'
    const tools = webToolsEnabled ? [
      { type: 'function' as const, function: WEB_TOOLS_FUNCTIONS.web_search },
      { type: 'function' as const, function: WEB_TOOLS_FUNCTIONS.fetch_page }
    ] : undefined

    console.log('[CHAT-CONV]', { webToolsEnabled, MAX_MS })

    // Reset tool budget for this request
    if (webToolsEnabled) {
      resetToolBudget()
    }

    // Initialize OpenAI with proper timeout and retries
    const openai = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY,
      timeout: MAX_MS,
      maxRetries: 2
    })
    const baseMsgs = [
      { role: 'system' as const, content: ELITE_OM_ADVISOR_PROMPT + documentContext },
      ...messages.map(m => ({ role: m.role as any, content: m.content }))
    ]

    if (webToolsEnabled) {
      try {
        // Pass 1: non-streaming to collect complete tool_calls
        const pass1Start = Date.now()
        console.log('[CHAT-CONV] Starting Pass 1 (tool collection)')
        
        // Create abort controller with proper timeout
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(new Error('timeout:CONV_MAX_RUN_MS')), MAX_MS);
        
        try {
          const first = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o',
            messages: baseMsgs,
            tools,
            stream: false
          }, { 
            signal: ac.signal
          })
          
          const pass1Duration = Date.now() - pass1Start
          console.log(`[CHAT-CONV] Pass 1 completed in ${pass1Duration}ms`)
        
          clearTimeout(timer) // Clear the timeout on success
          
          const m = first.choices[0]?.message
          const calls = m?.tool_calls ?? []
      
      if (calls.length) {
        // Execute tools with progress updates
        const authHeader = req.headers.authorization
        const authToken = authHeader?.replace('Bearer ', '') || ''
        const toolMessages: any[] = []
        
        const toolsStart = Date.now()
        console.log(`[CHAT-CONV] Executing ${calls.length} tool calls`)
        
        // Send progress update about tool execution
        res.write(`data: ${JSON.stringify({ content: `Executing ${calls.length} search${calls.length > 1 ? 'es' : ''} and data requests...\n\n` })}\n\n`)
        
        for (let i = 0; i < calls.length; i++) {
          const tc = calls[i]
          if (tc.type === 'function') {
            const toolStart = Date.now()
            console.log(`[CHAT-CONV] Executing tool ${i+1}/${calls.length}: ${tc.function.name}`)
            
            try {
              const args = JSON.parse(tc.function.arguments || '{}')
              const out = await executeWebToolsFunction({
                name: tc.function.name as any,
                arguments: args
              }, authToken)
              const formatted = formatWebToolsResponse(out)
              toolMessages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: formatted
              })
              
              const toolDuration = Date.now() - toolStart
              console.log(`[CHAT-CONV] Tool ${i+1} completed in ${toolDuration}ms`)
            } catch (error) {
              const toolDuration = Date.now() - toolStart
              console.error(`[CHAT-CONV] Tool ${i+1} failed after ${toolDuration}ms:`, error)
              
              // Add error result but continue with other tools
              toolMessages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: 'Tool execution failed - proceeding with available information.'
              })
            }
          }
        }
        
        const toolsTotal = Date.now() - toolsStart
        console.log(`[CHAT-CONV] All tools completed in ${toolsTotal}ms`)
        
        // Send final progress update
        res.write(`data: ${JSON.stringify({ content: 'Generating response with collected information...\n\n' })}\n\n`)
        
        // Pass 2: stream final answer with tool results
        const finalMsgs = [
          ...baseMsgs,
          { role: 'assistant', tool_calls: calls },
          ...toolMessages
        ]
        
        const finalStream = await openai.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o',
          messages: finalMsgs,
          stream: true,
          tools: undefined
        })
        
        for await (const chunk of finalStream) {
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
        }
        
        // Stream complete - client will handle connection close
        return
      }
      // No tool calls requested: stream a normal answer
        } finally {
          if (timer) clearTimeout(timer as NodeJS.Timeout) // Always clear the timer
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        console.error('[CHAT-CONV] Pass 1 or tools failed, falling back to streaming-only:', errorMsg)
        
        // Send fallback message to user
        res.write(`data: ${JSON.stringify({ content: 'Proceeding with document analysis only...\n\n' })}\n\n`)
        
        // Fall through to streaming-only mode below
      }
    }

    // Single streaming pass (no tools or tools not enabled)
    console.log('[CHAT] calling OpenAI…');
    const t0 = Date.now();
    
    // Environment-gated model selection
    const useFastModel = process.env.USE_FAST_MODEL === 'true'
    const model = useFastModel ? 
      (process.env.CHAT_MODEL_FAST || 'gpt-4o-mini') : 
      (process.env.OPENAI_MODEL || 'gpt-4o')
    
    const stream = await openai.chat.completions.create({
      model,
      messages: baseMsgs,
      stream: true
    })
    
    console.log('[CHAT] OpenAI connected in', Date.now() - t0, 'ms');
    
    let firstToken = true;
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        if (firstToken) {
          console.log('[CHAT] First token received in', Date.now() - t0, 'ms');
          if (ttfbGuard) clearTimeout(ttfbGuard);
          firstToken = false;
        }
        res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
      }
    }
    
    console.log('[CHAT] Stream completed in', Date.now() - t0, 'ms');

    // Stream complete - client will handle connection close
  } catch (error) {
    const isTimeout = error instanceof Error && /timeout:CONV_MAX_RUN_MS/.test(error.message)
    console.error('[CHAT-CONV] Error:', error, { isTimeout })
    
    const errorMessage = isTimeout 
      ? `LLM request timed out after ${MAX_MS/1000}s` 
      : 'Stream failed'
    
    res.write(`event: error\ndata: ${JSON.stringify({ 
      error: errorMessage,
      code: isTimeout ? 'LLM_TIMEOUT' : 'STREAM_ERROR' 
    })}\n\n`)
  } finally {
    cleanup()
    res.end()
  }
}

// Get recent documents for user from KV store
async function getRecentDocuments(userId: string): Promise<string[]> {
  if (!kvStore) {
    console.log('[chat-conversational] KV not available, no recent docs')
    return []
  }

  try {
    const recentKey = `recent:${userId}:docIds`
    const docIds: string[] = await kvStore.get(recentKey) || []
    console.log(`[chat-conversational] Found ${docIds.length} recent docs for user ${userId}`)
    return docIds
  } catch (error) {
    console.warn('[chat-conversational] Failed to get recent documents:', error)
    return []
  }
}

export default withAuth(handler)