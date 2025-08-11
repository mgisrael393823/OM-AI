import OpenAI from 'openai'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

const RESPONSES_MODEL = /^(gpt-5($|-)|gpt-4\.1($|-)|o4|o3)/i
const isResponsesModel = (m: string) => RESPONSES_MODEL.test(m)

async function withRetry<T>(fn: () => Promise<T>, tries = 2) {
  let last: any
  for (let i = 0; i < tries; i++) {
    try { return await fn() } catch (e: any) {
      last = e
      const msg = e?.message || ''
      if (!/timeout|ETIMEDOUT|ECONNRESET|5\d\d/.test(msg) && e?.status !== 503) break
      await new Promise(r => setTimeout(r, 500 * (i + 1)))
    }
  }
  throw last
}

export async function createChatCompletion(args: {
  model: string
  messages: { role: 'system'|'user'|'assistant'; content: string }[]
  temperature?: number
  max_output_tokens?: number
  max_tokens?: number
  maxTokens?: number
}) {
  const desired = (args.model || process.env.OPENAI_MODEL || '').trim()
  const fallback = (process.env.OPENAI_FALLBACK_MODEL || 'gpt-4.1').trim()
  let model = desired || fallback

  // Unify token limit env -> default 2000
  const limit =
    args.max_output_tokens ??
    args.max_tokens ??
    args.maxTokens ??
    Number(process.env.CHAT_MAX_TOKENS ?? 2000)

  // Build parameters based on API type - never send temperature to Responses API
  const buildParams = (withoutTemperature = false) => {
    if (isResponsesModel(model)) {
      const params = {
        model,
        input: args.messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n'),
        max_output_tokens: limit
      }
      console.log('[openai] Responses API:', { apiFamily: 'responses', model, max_output_tokens: limit })
      return params
    } else {
      const params: any = {
        model,
        messages: args.messages as any,
        max_tokens: limit
      }
      if (!withoutTemperature) {
        params.temperature = args.temperature ?? 0.2
      }
      console.log('[openai] Chat Completions:', { 
        apiFamily: 'chat', model, max_tokens: limit, 
        temperature: withoutTemperature ? undefined : params.temperature 
      })
      return params
    }
  }

  const run = (withoutTemperature = false) => {
    const params = buildParams(withoutTemperature)
    return isResponsesModel(model)
      ? (client as any).responses.create(params)
      : client.chat.completions.create(params)
  }

  // Helper to normalize response format for both APIs
  const parseResponse = (resp: any, actualModel: string) => {
    if (isResponsesModel(actualModel)) {
      const text = resp.output_text ?? resp.content?.[0]?.text ?? ''
      return { text: String(text).trim(), usage: resp.usage, model: actualModel }
    } else {
      const text = resp.choices?.[0]?.message?.content ?? ''
      return { text: String(text).trim(), usage: resp.usage, model: resp.model || actualModel }
    }
  }

  try {
    const resp: any = await withRetry(() => run(false))
    return parseResponse(resp, model)
  } catch (e: any) {
    const msg = e?.message || ''
    const status = e?.status || 0
    
    // Handle temperature parameter error for Chat Completions only
    if (status === 400 && /temperature/i.test(msg) && !isResponsesModel(model)) {
      console.warn('[openai] Retrying Chat Completions without temperature due to:', msg)
      try {
        const resp: any = await withRetry(() => run(true))
        return parseResponse(resp, model)
      } catch (retryError: any) {
        console.error('[openai] Retry without temperature failed:', retryError?.message)
        throw retryError
      }
    }
    
    // Fallback to different model only on server errors, timeouts, or specific model errors
    const isServerError = status >= 500
    const isNetworkError = /timeout|ETIMEDOUT|ECONNRESET/.test(msg)
    const isModelError = /(model.*not.*found|does not exist|model.*unsupported)/i.test(msg)
    
    if (model !== fallback && (isServerError || isNetworkError || isModelError)) {
      console.warn('[openai] Falling back to model:', fallback, 'due to error:', msg)
      model = fallback
      const resp: any = await withRetry(() => run(false))
      return parseResponse(resp, model)
    }
    
    // For 4xx client errors (except handled cases), fail fast
    if (status >= 400 && status < 500) {
      console.error('[openai] Client error (4xx) - check configuration:', { status, message: msg, model })
    }
    
    throw e
  }
}

// Export compatibility for existing code that may use the class
export class OpenAIService {
  async createChatCompletion(request: any) {
    return createChatCompletion({
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      max_output_tokens: request.maxTokens || request.max_tokens || request.max_completion_tokens || request.max_output_tokens
    })
  }
}

export const openAIService = new OpenAIService()