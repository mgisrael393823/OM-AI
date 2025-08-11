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

  console.log('[openai] Using model:', model, 'maxOutput:', limit)

  const run = () => isResponsesModel(model)
    ? (client as any).responses.create({
        model,
        // simple linearized messages for Responses
        input: args.messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n'),
        temperature: args.temperature ?? 0.2,
        // IMPORTANT: Responses API uses max_output_tokens
        max_output_tokens: limit
      })
    : client.chat.completions.create({
        model,
        messages: args.messages as any,
        temperature: args.temperature ?? 0.2,
        // Chat Completions uses max_tokens
        max_tokens: limit
      })

  try {
    const resp: any = await withRetry(run)
    if (isResponsesModel(model)) {
      const text = resp.output_text ?? resp.content?.[0]?.text ?? ''
      return { text: String(text).trim(), usage: resp.usage, requestId: resp.id, model }
    } else {
      const text = resp.choices?.[0]?.message?.content ?? ''
      return { text: String(text).trim(), usage: resp.usage, requestId: resp.id, model: resp.model }
    }
  } catch (e: any) {
    const msg = e?.message || ''
    if (model !== fallback && /(model.*not.*found|does not exist|unsupported)/i.test(msg)) {
      console.warn('[openai] Downgrading model to fallback:', fallback, 'due to:', msg)
      model = fallback
      const resp: any = await withRetry(run)
      if (isResponsesModel(model)) {
        const text = resp.output_text ?? resp.content?.[0]?.text ?? ''
        return { text: String(text).trim(), usage: resp.usage, requestId: resp.id, model }
      } else {
        const text = resp.choices?.[0]?.message?.content ?? ''
        return { text: String(text).trim(), usage: resp.usage, requestId: resp.id, model: resp.model }
      }
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