import OpenAI from 'openai'
import { isResponsesModel } from './modelUtils'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

interface RequestPayload {
  model: string
  messages?: { role: 'system' | 'user' | 'assistant'; content: string }[]
  input?: string | { text: string; role?: 'system' | 'user' | 'assistant' }[]
  max_tokens?: number
  max_output_tokens?: number
}

export async function createChatCompletion(payload: RequestPayload) {
  const model = payload.model || process.env.OPENAI_MODEL || 'gpt-4o'
  const isResponses = isResponsesModel(model) || !!payload.input
  const limit =
    payload.max_output_tokens ??
    payload.max_tokens ??
    Number(process.env.CHAT_MAX_TOKENS ?? 2000)

  let attempt = 0
  while (true) {
    try {
      if (isResponses) {
        const params: any = { model, max_output_tokens: limit }
        if (payload.messages) params.messages = payload.messages
        if (payload.input) params.input = payload.input
        const resp: any = await client.responses.create(params, {
          signal: AbortSignal.timeout(95000)
        })
        const content = resp.output_text ?? resp.content?.[0]?.text ?? ''
        return { content: String(content).trim(), model, usage: resp.usage }
      } else {
        const params: any = {
          model,
          messages: payload.messages || [],
          max_tokens: limit
        }
        const resp: any = await client.chat.completions.create(params, {
          signal: AbortSignal.timeout(95000)
        })
        const content = resp.choices?.[0]?.message?.content ?? ''
        return {
          content: String(content).trim(),
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
