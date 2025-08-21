import type { NextApiRequest, NextApiResponse } from 'next'
import { generateRequestId as generateReqId } from '@/lib/config/validate-models'
import { isResponsesModel as isResponsesModelUtil } from '@/lib/services/openai/modelUtils'
import { createTimeoutSignal } from './signals'
import { structuredLog } from '@/lib/log'
import { metrics } from './metrics'

export async function handle(req: NextApiRequest, res: NextApiResponse) {
  const requestId =
    (req.headers['x-request-id'] as string) ||
    (req.query.request_id as string) ||
    (req.query.requestId as string) ||
    generateReqId('chat')
  if (!req.headers['x-request-id']) {
    req.headers['x-request-id'] = requestId
  }

  const startTime = Date.now()
  const { signal } = createTimeoutSignal(10000)

  const model = (req.body && typeof req.body === 'object' ? (req.body as any).model : undefined) as string | undefined
  const useResponses = process.env.USE_GPT5 === '1' && model && isResponsesModelUtil(model)
  const apiFamily = useResponses ? 'responses' : 'completions'

  structuredLog('info', 'router_ingress', {
    route: 'chat',
    path: 'refactored',
    apiFamily,
    model: model || 'unknown',
    requestId,
    userId: (req as any).user?.id || 'anonymous'
  })
  metrics.count('chat_requests', 1, { apiFamily })

  const isConversational = process.env.CONVERSATIONAL_CHAT === '1'

  // TODO[Claude]: add advanced routing rules, model matrix, and kill-switch precedence

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
    userId: (req as any).user?.id || 'anonymous'
  })
  metrics.timing('chat_latency_ms', latencyMs, { apiFamily })
}
