import OpenAI from 'openai'
import { isResponsesModel } from './modelUtils'

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

export async function createChatCompletion(payload: RequestPayload, options?: { signal?: AbortSignal }) {
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
        const responsesParams: any = (({model,input,max_output_tokens,tool_choice,response_format,temperature,stream}) => 
          ({model,input,max_output_tokens,tool_choice,response_format,temperature,stream}))(payload)
        // Override with computed values
        responsesParams.model = model
        responsesParams.max_output_tokens = limit
        // Ensure stream is properly typed
        if (responsesParams.stream === undefined) {
          delete responsesParams.stream
        }
        
        const resp: any = await client.responses.create(responsesParams, {
          signal: options?.signal || AbortSignal.timeout(95000)
        })
        const content = resp.output_text ?? resp.content?.[0]?.text ?? ''
        return { content: String(content).trim(), model, usage: resp.usage }
      } else {
        const chatParams: any = (({model,messages,max_tokens,tool_choice,response_format,temperature,stream}) => 
          ({model,messages,max_tokens,tool_choice,response_format,temperature,stream}))(payload)
        // Override with computed values  
        chatParams.model = model
        chatParams.messages = payload.messages || []
        chatParams.max_tokens = limit
        // Ensure stream is properly typed
        if (chatParams.stream === undefined) {
          delete chatParams.stream
        }
        
        const resp: any = await client.chat.completions.create(chatParams, {
          signal: options?.signal || AbortSignal.timeout(95000)
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
      throw e
    }
  }
}

export class OpenAIService {
  async createChatCompletion(request: RequestPayload) {
    return createChatCompletion(request)
  }
}

export const openAIService = new OpenAIService()
