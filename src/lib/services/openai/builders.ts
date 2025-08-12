export interface ChatCompletionPayload {
  model: string
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
  max_tokens?: number
}

export interface ResponsesPayload {
  model: string
  messages?: { role: 'system' | 'user' | 'assistant'; content: string }[]
  input?: string | { text: string; role?: 'system' | 'user' | 'assistant' }[]
  max_output_tokens?: number
}

export function chatCompletion(payload: ChatCompletionPayload) {
  return {
    model: payload.model,
    messages: payload.messages,
    max_tokens:
      payload.max_tokens ?? Number(process.env.CHAT_MAX_TOKENS ?? 2000)
  }
}

export function responses(payload: ResponsesPayload) {
  const built: any = {
    model: payload.model,
    max_output_tokens:
      payload.max_output_tokens ?? Number(process.env.CHAT_MAX_TOKENS ?? 2000)
  }
  if (payload.messages) built.messages = payload.messages
  if (payload.input) built.input = payload.input
  return built
}
