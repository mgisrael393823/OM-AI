import type { NextApiRequest, NextApiResponse } from 'next'
import { isResponsesModel as isResponsesModelUtil } from '@/lib/services/openai/modelUtils'
import { createTimeoutSignal } from './signals'
import { structuredLog } from '@/lib/log'
import { metrics } from './metrics'

interface ChatContext {
  requestId: string
  userId?: string
  model?: string
}

export async function handle(req: NextApiRequest, res: NextApiResponse, context?: ChatContext) {
  // Use provided context requestId (from chat.ts) instead of regenerating
  const requestId = context?.requestId || 'unknown'
  const userId = context?.userId || 'anonymous'

  const startTime = Date.now()
  const { signal } = createTimeoutSignal(10000)

  const model = context?.model || (req.body && typeof req.body === 'object' ? (req.body as any).model : undefined) as string | undefined
  const useResponses = process.env.USE_GPT5 === '1' && model && isResponsesModelUtil(model)
  const apiFamily = useResponses ? 'responses' : 'completions'

  structuredLog('info', 'router_ingress', {
    route: 'chat',
    path: 'refactored',
    apiFamily,
    model: model || 'unknown',
    requestId,
    userId
  })
  metrics.count('chat_requests', 1, { apiFamily })

  const isConversational = process.env.CONVERSATIONAL_CHAT === '1'

  // Route to appropriate handler based on API family
  if (apiFamily === 'responses') {
    const { handle } = await import('./handlers/responses')
    await handle(req, res, { requestId, signal, startTime, isConversational })
  } else {
    const { handle } = await import('./handlers/completions')
    await handle(req, res, { requestId, signal, startTime, isConversational })
  }
  
  const latencyMs = Date.now() - startTime
  structuredLog('info', 'router_egress', {
    route: 'chat',
    path: 'refactored',
    apiFamily,
    model: model || 'unknown',
    requestId,
    latencyMs,
    userId
  })
  metrics.timing('chat_latency_ms', latencyMs, { apiFamily })
}