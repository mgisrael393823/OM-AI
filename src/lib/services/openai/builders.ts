import { getTokenParamForModel, getTokenParam } from '@/lib/config/validate-models'

export interface ChatCompletionPayload {
  model: string
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
  max_tokens?: number
}

export interface ResponsesPayload {
  model: string
  messages?: { role: 'system' | 'user' | 'assistant'; content: string }[]
  input?: string | { content: string; role?: 'system' | 'user' | 'assistant' }[]
  max_output_tokens?: number
}

export function chatCompletion(payload: ChatCompletionPayload) {
  const tokenValue = payload.max_tokens || Number(process.env.CHAT_MAX_TOKENS ?? 2000)
  const tokenParam = getTokenParam(payload.model, tokenValue)
  
  return {
    model: payload.model,
    messages: payload.messages,
    ...tokenParam
  }
}

export function responses(payload: ResponsesPayload) {
  const tokenValue = payload.max_output_tokens || Number(process.env.CHAT_MAX_TOKENS ?? 2000)
  const tokenParam = getTokenParam(payload.model, tokenValue)
  
  const built: any = {
    model: payload.model,
    ...tokenParam
  }
  if (payload.messages) built.messages = payload.messages
  if (payload.input) built.input = payload.input
  return built
}
