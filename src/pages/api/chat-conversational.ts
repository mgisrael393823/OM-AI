import type { NextApiRequest, NextApiResponse } from 'next'
import { OpenAI } from 'openai'
import { z } from 'zod'
import { ELITE_OM_ADVISOR_PROMPT } from '@/lib/prompts/elite-om-advisor'
import { getRelevantChunks } from '@/lib/rag/conversational-retriever'
import { withAuth } from '@/lib/auth-middleware'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { WEB_TOOLS_FUNCTIONS } from '@/lib/services/web-tools/tool-definitions'
import { executeWebToolsFunction, formatWebToolsResponse, resetToolBudget } from '@/lib/services/web-tools/function-handler'

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
  sessionId: z.string().optional()
})

// Document ID validation
function isValidDocumentId(id: string): boolean {
  return id.startsWith('mem-') || /^[0-9a-fA-F-]{36}$/.test(id)
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
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

  const { messages, documentId } = validation.data
  const safeDocId = documentId && isValidDocumentId(documentId) ? documentId : undefined

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders?.();
  res.write(':ok\n\n'); // prelude to keep the pipe open

  const controller = new AbortController();
  const heartbeat = setInterval(() => res.write(':hb\n\n'), 15000);
  req.on('close', () => { clearInterval(heartbeat); controller.abort(); });

  try {
    // Get document context
    let documentContext = ''
    if (safeDocId) {
      const chunks = await getRelevantChunks(safeDocId, messages)
      if (chunks?.length) {
        documentContext = '\n\nDocument context:\n' + 
          chunks.map(c => `[Page ${c.page}] ${c.content}`).join('\n')
        
        // Context cap
        const MAX_CONTEXT_CHARS = 24000;
        documentContext = documentContext.slice(0, MAX_CONTEXT_CHARS);
      }
    }

    // Prepare function tools if web tools are enabled
    const webToolsEnabled = isFeatureEnabled('WEB_TOOLS')
    const tools = webToolsEnabled ? [
      { type: 'function' as const, function: WEB_TOOLS_FUNCTIONS.web_search },
      { type: 'function' as const, function: WEB_TOOLS_FUNCTIONS.fetch_page }
    ] : undefined

    console.log('[CHAT-CONV] Web tools enabled:', webToolsEnabled)

    // Reset tool budget for this request
    if (webToolsEnabled) {
      resetToolBudget()
    }

    // Prepare base messages
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const baseMsgs = [
      { role: 'system' as const, content: ELITE_OM_ADVISOR_PROMPT + documentContext },
      ...messages.map(m => ({ role: m.role as any, content: m.content }))
    ]

    if (webToolsEnabled) {
      // Pass 1: non-streaming to collect complete tool_calls
      const first = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        messages: baseMsgs,
        tools,
        stream: false
      }, { signal: AbortSignal.timeout(55000) })

      const m = first.choices[0]?.message
      const calls = m?.tool_calls ?? []
      
      if (calls.length) {
        // Execute tools
        const authHeader = req.headers.authorization
        const authToken = authHeader?.replace('Bearer ', '') || ''
        const toolMessages: any[] = []
        
        for (const tc of calls) {
          if (tc.type === 'function') {
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
          }
        }
        
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
        }, { signal: AbortSignal.timeout(55000) })
        
        for await (const chunk of finalStream) {
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
        }
        
        res.write('data: [DONE]\n\n')
        return
      }
      // No tool calls requested: stream a normal answer
    }

    // Single streaming pass (no tools or tools not enabled)
    const stream = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: baseMsgs,
      stream: true
    }, { signal: AbortSignal.timeout(55000) })

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
    }

    res.write('data: [DONE]\n\n')
  } catch (error) {
    console.error('[CHAT-CONV] Error:', error)
    res.write(`event: error\ndata: ${JSON.stringify({ error: 'Stream failed' })}\n\n`)
  } finally {
    clearInterval(heartbeat)
    res.end()
  }
}

export default withAuth(handler)