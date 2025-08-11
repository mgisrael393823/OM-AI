import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  timeout: Number(process.env.OPENAI_TIMEOUT_MS || 20_000)
})

const RESPONSES_FAMILY = /^(gpt-5|gpt-4\.1|o)/i
const isResponsesModel = (m: string) => RESPONSES_FAMILY.test(m)

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
  const fallback = (process.env.OPENAI_FALLBACK_MODEL || '').trim()
  const initialModel = desired || fallback

  // Unify token limit env -> default 2000
  const limit =
    args.max_output_tokens ??
    args.max_tokens ??
    args.maxTokens ??
    Number(process.env.CHAT_MAX_TOKENS ?? 2000)

  async function exec(model: string) {
    const useResponses = isResponsesModel(model)
    const includeTemp = args.temperature !== undefined && !/^gpt-4\.1/i.test(model)

    const run = () => useResponses
      ? (client as any).responses.create({
          model,
          input: args.messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n'),
          max_output_tokens: limit,
          ...(includeTemp ? { temperature: args.temperature } : {})
        })
      : client.chat.completions.create({
          model,
          messages: args.messages as any,
          max_tokens: limit,
          ...(includeTemp ? { temperature: args.temperature } : {})
        })

    const resp: any = await withRetry(run)
    const text = useResponses
      ? (resp.output_text ?? resp.content?.[0]?.text ?? '')
      : (resp.choices?.[0]?.message?.content ?? '')

    console.log(
      `[openai] model=${model} api=${useResponses ? 'responses' : 'chat'} max=${limit} temp=${includeTemp ? 'set' : 'omitted'} id=${resp.id}`
    )

    return {
      text: String(text).trim(),
      usage: resp.usage,
      requestId: resp.id,
      model: useResponses ? model : resp.model
    }
  }

  try {
    return await exec(initialModel)
  } catch (e: any) {
    const msg = e?.message || ''
    const status = e?.status
    if (
      fallback &&
      initialModel !== fallback &&
      (status === 400 || /model.*not.*found|does not exist|unsupported/i.test(msg))
    ) {
      console.warn('[openai] falling back to', fallback, 'due to:', msg)
      return await exec(fallback)
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