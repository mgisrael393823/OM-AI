import type { NextApiRequest, NextApiResponse } from 'next'
import { OpenAI } from 'openai'
import { z } from 'zod'
import { ELITE_OM_ADVISOR_PROMPT } from '@/lib/prompts/elite-om-advisor'
import { getRelevantChunks } from '@/lib/rag/conversational-retriever'
import { withAuth } from '@/lib/auth-middleware'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { OM_FUNCTIONS } from '@/lib/services/openai/functions/om-functions'
import { executeWebToolsFunction, formatWebToolsResponse } from '@/lib/services/web-tools/function-handler'

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
  res.setHeader('Content-Type','text/event-stream');
  res.setHeader('Cache-Control','no-cache, no-transform');
  res.setHeader('Connection','keep-alive');
  res.flushHeaders?.();

  // Heartbeat and cleanup
  const controller = new AbortController();
  const hb = setInterval(()=>res.write(':heartbeat\n\n'), 30000);
  req.on('close', ()=>{ clearInterval(hb); controller.abort(); res.end(); });

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
      { type: 'function', function: OM_FUNCTIONS.search_market_data },
      { type: 'function', function: OM_FUNCTIONS.map_property_vs_comps }
    ] : undefined

    console.log('[CHAT-CONV] Web tools enabled:', webToolsEnabled)

    // Prepare base messages
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const baseMsgs = [
      { role: 'system', content: ELITE_OM_ADVISOR_PROMPT + documentContext },
      ...messages
    ]

    if (webToolsEnabled) {
      // Pass 1: non-streaming to collect complete tool_calls
      const first = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        messages: baseMsgs,
        tools,
        stream: false
      }, { signal: controller.signal })

      const m = first.choices[0]?.message
      const calls = m?.tool_calls ?? []
      
      if (calls.length) {
        // Execute tools
        const authHeader = req.headers.authorization
        const authToken = authHeader?.replace('Bearer ', '') || ''
        const toolMessages: any[] = []
        
        for (const tc of calls) {
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
        }, { signal: controller.signal })
        
        for await (const chunk of finalStream) {
          const content = chunk.choices[0]?.delta?.content
          if (content) {
            res.write(`data: ${JSON.stringify({ content })}\n\n`)
          }
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
    }, { signal: controller.signal })

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`)
      }
    }

    res.write('data: [DONE]\n\n')
  } catch (error) {
    console.error('[CHAT-CONV] Error:', error)
    res.write(`event: error\ndata: ${JSON.stringify({ error: 'Stream failed' })}\n\n`)
  } finally {
    clearInterval(hb)
    res.end()
  }
}

export default withAuth(handler)