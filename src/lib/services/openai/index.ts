import OpenAI from 'openai'
import { isResponsesModel } from './modelUtils'

/**
 * Removes response_format when set to text. The current OpenAI SDK
 * doesn't require an explicit text response format and will throw
 * errors if the field is provided. We keep the response_format for
 * other types like json_schema.
 */
export function fixResponseFormat(payload: any) {
  if (payload?.response_format?.type === 'text') {
    delete payload.response_format
  }
}

/**
 * Sanitizes OpenAI payloads to prevent tool_choice without tools errors
 * and removes undefined values that cause SDK issues
 */
function sanitizeOpenAIPayload(payload: any): any {
  const cleaned = { ...payload }
  
  // Remove tool_choice if no tools are present
  if (!cleaned.tools || (Array.isArray(cleaned.tools) && cleaned.tools.length === 0)) {
    delete cleaned.tool_choice
    delete cleaned.tools
  }
  
  // Remove undefined/null values that cause SDK errors
  Object.keys(cleaned).forEach(key => {
    if (cleaned[key] === undefined || cleaned[key] === null) {
      delete cleaned[key]
    }
  })
  
  return cleaned
}

// Module-scope client reuse for better performance
const client = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY!,
  timeout: 30000,
  maxRetries: 1, // Reduce retries for speed
  defaultHeaders: {
    'Connection': 'keep-alive'
  }
})

interface RequestPayload {
  model: string
  messages?: { role: 'system' | 'user' | 'assistant'; content: string }[]
  input?: string | { text: string; role?: 'system' | 'user' | 'assistant' }[]
  text?: string
  max_tokens?: number
  max_output_tokens?: number
  temperature?: number
  tool_choice?: string | object
  response_format?: object
  stream?: boolean
  [key: string]: any // Allow additional properties
}

// Fast model configuration helper
export function getFastModel(): string {
  return process.env.USE_FAST_MODEL === 'true' ? 
    (process.env.CHAT_MODEL_FAST || 'gpt-4o-mini') : 
    (process.env.OPENAI_MODEL || 'gpt-4o')
}

// Safe signal combining helper
function combineAbortSignals(signals: (AbortSignal | undefined)[]): AbortSignal {
  const validSignals = signals.filter(Boolean) as AbortSignal[]
  
  if (validSignals.length === 0) {
    return new AbortController().signal
  }
  
  if (validSignals.length === 1) {
    return validSignals[0]
  }
  
  // Feature detect AbortSignal.any
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any(validSignals)
  }
  
  // Fallback for environments without AbortSignal.any
  const controller = new AbortController()
  
  for (const signal of validSignals) {
    if (signal.aborted) {
      controller.abort()
      break
    }
    signal.addEventListener('abort', () => controller.abort(), { once: true })
  }
  
  return controller.signal
}

export async function createChatCompletion(
  payload: RequestPayload, 
  options?: { signal?: AbortSignal, requestId?: string }
) {
  // GUARANTEED: Use provided requestId, never generate new one
  const reqId = options?.requestId
  if (!reqId) {
    const error = new Error('requestId is required for createChatCompletion')
    ;(error as any).code = 'MISSING_REQUEST_ID'
    throw error
  }
  
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => timeoutController.abort(), 12000) // Reduced from 27s to 12s
  
  try {
    const combinedSignal = combineAbortSignals([options?.signal, timeoutController.signal])
    
    fixResponseFormat(payload)
    const model = payload.model || getFastModel()
    const isResponses = isResponsesModel(model) || !!payload.input
    const limit =
      payload.max_output_tokens ??
      payload.max_tokens ??
      Number(process.env.CHAT_MAX_TOKENS ?? 1500) // Reduced for speed

    let attempt = 0
  while (true) {
    try {
      if (isResponses) {
        let responsesParams: any = (({model,input,text,max_output_tokens,tool_choice,response_format,temperature,stream}) =>
          ({model,input,text,max_output_tokens,tool_choice,response_format,temperature,stream}))(payload)
        // Override with computed values
        responsesParams.model = model
        // Don't override token params if already provided by getTokenParam
        if (!responsesParams.max_output_tokens) {
          // Default fallback only if no token param provided
          responsesParams.max_output_tokens = limit
        }
        // Sanitize the payload
        responsesParams = sanitizeOpenAIPayload(responsesParams)
        
        const resp: any = await client.responses.create(responsesParams, {
          signal: combinedSignal
        })
        // Parse Responses API format: resp.output[0].content[0].text or resp.output_text
        const content = resp.output?.[0]?.content?.[0]?.text ?? resp.output_text ?? ''
        return { content: String(content).trim(), model, usage: resp.usage }
      } else {
        let chatParams: any = (({model,messages,max_tokens,tool_choice,response_format,temperature,stream}) => 
          ({model,messages,max_tokens,tool_choice,response_format,temperature,stream}))(payload)
        // Override with computed values  
        chatParams.model = model
        chatParams.messages = payload.messages || []
        // Don't override max_tokens if already set by getMaxTokensParam
        if (!chatParams.max_tokens) {
          chatParams.max_tokens = limit
        }
        // Sanitize the payload
        chatParams = sanitizeOpenAIPayload(chatParams)
        
        const resp: any = await client.chat.completions.create(chatParams, {
          signal: combinedSignal
        })
        const content = String(resp.choices?.[0]?.message?.content ?? '').trim()
        return {
          content,
          model: resp.model || model,
          usage: resp.usage
        }
      }
    } catch (e: any) {
      const msg = e?.message || ''
      if ((e.code === 'ETIMEDOUT' || /timeout/i.test(msg)) && attempt < 2) {
        const delay = Math.pow(2, attempt) * 1000
        await new Promise(r => setTimeout(r, delay))
        attempt++
        continue
      }
      
      // Convert to proper Error object with requestId
      if (typeof e === 'object' && e !== null && !(e instanceof Error)) {
        const error = new Error(e.message || 'OpenAI API error')
        error.name = 'OpenAIError'
        ;(error as any).code = e.code || 'UPSTREAM_ERROR'
        ;(error as any).status = e.status
        ;(error as any).requestId = reqId
        throw error
      }
      
      // Attach requestId to existing errors
      if (e instanceof Error && !(e as any).requestId) {
        ;(e as any).requestId = reqId
      }
      
      throw e
    }
  }
  } catch (error: any) {
    // Handle timeout specifically
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Upstream timeout')
      timeoutError.name = 'UpstreamTimeoutError'
      ;(timeoutError as any).code = 'UPSTREAM_ERROR'
      ;(timeoutError as any).requestId = reqId
      throw timeoutError
    }
    
    // Re-throw other errors as real Error objects if they aren't already
    if (typeof error === 'object' && error !== null && !(error instanceof Error)) {
      const realError = new Error(error.message || 'OpenAI API error')
      realError.name = 'OpenAIError'
      ;(realError as any).code = error.code || 'UPSTREAM_ERROR'
      ;(realError as any).status = error.status
      ;(realError as any).requestId = reqId
      throw realError
    }
    
    // Attach requestId to existing errors
    if (error instanceof Error && !(error as any).requestId) {
      ;(error as any).requestId = reqId
    }
    
    throw error
  } finally {
    clearTimeout(timeoutId)  // Always clear timeout
  }
}

export class OpenAIService {
  async createChatCompletion(request: RequestPayload) {
    return createChatCompletion(request)
  }
}

export const openAIService = new OpenAIService()
