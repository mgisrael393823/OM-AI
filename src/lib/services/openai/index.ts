import OpenAI from 'openai'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

const RESPONSES_MODEL = /^(gpt-5($|-)|gpt-4\.1($|-)|o4|o3)/i
const isResponsesModel = (m: string) => RESPONSES_MODEL.test(m)

// Enhanced retry with jitter for 429/5xx errors
async function withRetry<T>(fn: () => Promise<T>, tries = 2) {
  let lastError: any
  
  for (let i = 0; i < tries; i++) {
    try { 
      return await fn() 
    } catch (e: any) {
      lastError = e
      const msg = e?.message || ''
      const status = e?.status || 0
      
      // Only retry on server errors, timeouts, and rate limits
      const shouldRetry = status === 429 || 
                         status >= 500 || 
                         /timeout|ETIMEDOUT|ECONNRESET/i.test(msg)
      
      if (!shouldRetry || i === tries - 1) break
      
      // Exponential backoff with jitter
      const baseDelay = status === 429 ? 1000 : 500 // Longer delay for rate limits
      const jitter = Math.random() * 0.1 // ±10% jitter
      const delay = baseDelay * (i + 1) * (1 + jitter)
      
      console.warn(`[openai] Retrying in ${Math.round(delay)}ms after ${status || 'network'} error:`, msg)
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw lastError
}

// Request timeout wrapper
async function withTimeout<T>(promise: Promise<T>, timeoutMs = 30000): Promise<T> {
  const timeout = new Promise<never>((_, reject) => 
    setTimeout(() => reject(new Error(`Request timeout after ${timeoutMs}ms`)), timeoutMs)
  )
  return Promise.race([promise, timeout])
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

  const run = async (withoutTemperature = false) => {
    const params = buildParams(withoutTemperature)
    const apiCall = isResponsesModel(model)
      ? (client as any).responses.create(params)
      : client.chat.completions.create(params)
    
    return withTimeout(apiCall, 30000) // 30 second timeout
  }

  // Helper to normalize response format for both APIs
  const parseResponse = (resp: any, actualModel: string, headers?: any) => {
    const request_id = headers?.['x-request-id'] || headers?.['cf-ray'] || undefined
    
    if (isResponsesModel(actualModel)) {
      const text = resp.output_text ?? resp.content?.[0]?.text ?? ''
      return { 
        text: String(text).trim(), 
        usage: resp.usage, 
        model: actualModel,
        request_id
      }
    } else {
      const text = resp.choices?.[0]?.message?.content ?? ''
      return { 
        text: String(text).trim(), 
        usage: resp.usage, 
        model: resp.model || actualModel,
        request_id
      }
    }
  }

  try {
    const resp: any = await withRetry(() => run(false))
    // Try to extract headers from OpenAI response (may not be available in all cases)
    const headers = resp?._response?.headers || resp?.response?.headers
    return parseResponse(resp, model, headers)
  } catch (e: any) {
    const msg = e?.message || ''
    const status = e?.status || 0
    
    // Handle temperature parameter error for Chat Completions only
    if (status === 400 && /temperature/i.test(msg) && !isResponsesModel(model)) {
      console.warn('[openai] Retrying Chat Completions without temperature due to:', msg)
      try {
        const resp: any = await withRetry(() => run(true))
        const headers = resp?._response?.headers || resp?.response?.headers
        return parseResponse(resp, model, headers)
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
      const headers = resp?._response?.headers || resp?.response?.headers
      return parseResponse(resp, model, headers)
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