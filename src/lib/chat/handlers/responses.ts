import type { NextApiRequest, NextApiResponse } from 'next'
import { callWithFallback } from '../fallbacks'
import { handleStream } from '../client-wrapper'
import { jsonError } from '../errors'
import { structuredLog } from '@/lib/log'
import { metrics } from '../metrics'
import { buildResponses } from '../builders'

interface HandlerContext {
  requestId: string
  signal: AbortSignal
  startTime: number
  isConversational: boolean
}

export async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: HandlerContext
) {
  const body = req.body || {}
  const stream = Boolean(body.stream)
  const built = buildResponses({
    model: body.model,
    messages: body.messages,
    input: body.input,
    max_output_tokens: body.max_output_tokens ?? body.max_tokens
  }) as any
  const start = Date.now()
  structuredLog('info', 'handler_start', {
    route: 'chat',
    path: 'refactored',
    apiFamily: 'responses',
    model: body.model || 'unknown',
    requestId: ctx.requestId,
    userId: (req as any).user?.id || 'anonymous'
  })
  let usedFallback = false
  try {
    const response = await callWithFallback({
      messages: built.messages,
      input: built.input,
      maxTokens: built.max_output_tokens,
      stream,
      temperature: body.temperature,
      signal: ctx.signal
    }, built.model)

    if (stream) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      ;(res as any).flushHeaders?.()
      for await (const chunk of handleStream(response, 'responses')) {
        res.write(chunk)
      }
      res.end()
      return
    }

    return res.status(200).json(response)
  } catch (error: any) {
    const status = error?.status || 500
    const code = error?.code || 'OPENAI_ERROR'
    const message = error?.message || 'Upstream error'
    return jsonError(res, status, code, message, ctx.requestId)
  } finally {
    const latencyMs = Date.now() - start
    structuredLog('info', 'handler_finish', {
      route: 'chat',
      path: 'refactored',
      apiFamily: 'responses',
      model: body.model || 'unknown',
      requestId: ctx.requestId,
      latencyMs,
      usedFallback,
      userId: (req as any).user?.id || 'anonymous'
    })
    metrics.timing('handler_latency_ms', latencyMs, { apiFamily: 'responses' })
  }
}
