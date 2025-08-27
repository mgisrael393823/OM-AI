import type { NextApiRequest, NextApiResponse } from 'next'
import { handleStream } from '@/lib/services/openai/client-wrapper'
import { callWithFallback } from '@/lib/chat/fallbacks'
import { fixResponseFormat } from '@/lib/services/openai'
import { jsonError } from '../errors'
import { structuredLog } from '@/lib/log'
import { metrics } from '../metrics'
import { buildResponses } from '../builders'

// System message for structured OM analysis
const STRUCTURED_OUTPUT_SYSTEM_MESSAGE = {
  role: 'system' as const,
  content: `You are OM Intel, an elite commercial real estate analyst specializing in Offering Memorandum (OM) analysis. Provide clear, actionable insights in a natural, easy-to-read format.

When analyzing documents, structure your response as follows:

**📊 Key Metrics**
- Property: [Name and address]
- Price: [Asking price, price/unit, price/SF]
- Size: [Units/SF, year built]
- Returns: [Cap rate, NOI, GRM]

**💰 Financial Performance**
- Current NOI: [Amount and key drivers]
- Income: [Gross income, effective income, occupancy]
- Expenses: [Operating expenses, expense ratio]
- Upside: [Pro forma NOI, value-add opportunities]

**🏢 Property Overview**
- Type & Condition: [Property type, age, recent renovations]
- Unit Mix: [Brief breakdown of unit types and rents]
- Occupancy: [Current and historical]
- Market Position: [Compared to submarket]

**📍 Location Insights**
- Submarket: [Area name and characteristics]
- Access: [Transit, highways, walkability]
- Anchors: [Major employers, retail, amenities]
- Demographics: [Key population and income metrics]

**⚡ Investment Highlights**
[Top 3-5 most compelling investment points as bullet points]

**⚠️ Key Risks & Considerations**
[Top 3-5 risks or concerns as bullet points]

**🎯 Recommended Actions**
[3-5 specific next steps for due diligence]

Focus on what matters most to investors. Be concise but comprehensive. If data is missing, note it briefly without speculation.`
}

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

  // Ensure structured output system message is present for messages format
  if (built.messages && !built.messages.some((m: any) => m.role === 'system')) {
    built.messages.unshift(STRUCTURED_OUTPUT_SYSTEM_MESSAGE)
  }
  // For input format, prepend system message
  if (built.input && Array.isArray(built.input) && !built.input.some((m: any) => m.role === 'system')) {
    built.input.unshift(STRUCTURED_OUTPUT_SYSTEM_MESSAGE)
  }
  
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
    // Fix response format and call OpenAI service with requestId
    fixResponseFormat(built)
    
    // Map builder token fields to camelCase for CallOptions
    const maxTokens = built.max_output_tokens || built.max_tokens || built.maxTokens
    
    // Build payload with exactly one of messages or input, never both
    const payload: any = {
      maxTokens,
      stream,
      temperature: body.temperature,
      requestId: ctx.requestId,
      signal: ctx.signal
    }
    
    if (built.messages && built.messages.length > 0) {
      payload.messages = built.messages
    } else {
      payload.input = built.input
    }
    
    const response = await callWithFallback(payload, built.model)
    
    // Detect if fallback was used
    usedFallback = !!(response.meta?.usedFallback || response.usedFallback || response.source === 'fallback')

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
    const status = error?.status || 500;
    let code = error?.code || 'OPENAI_ERROR';
    let httpStatus = status;

    if (error?.message?.includes('parse') || error?.message?.includes('JSON')) {
      httpStatus = 422;
      code = 'PARSE_ERROR';
    } else if (error?.message?.includes('model') || error?.message?.includes('MODEL_UNAVAILABLE')) {
      httpStatus = 400;
      code = 'MODEL_ERROR';
    } else if (status >= 500) {
      httpStatus = 502;
      code = 'UPSTREAM_ERROR';
    }

    const message = error?.message || 'Upstream error';
    return jsonError(res, httpStatus, code, message, ctx.requestId, req);
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