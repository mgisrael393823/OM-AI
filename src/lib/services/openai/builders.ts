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
  /** Optional text format (e.g. 'markdown', 'html') */
  format?: string
}

export function buildChatCompletionPayload(payload: ChatCompletionPayload) {
  return {
    model: payload.model,
    messages: payload.messages,
    max_tokens:
      payload.max_tokens ?? Number(process.env.CHAT_MAX_TOKENS ?? 2000)
  }
}

export function buildResponsesPayload(payload: ResponsesPayload) {
  const built: any = {
    model: payload.model,
    max_output_tokens:
      payload.max_output_tokens ?? Number(process.env.CHAT_MAX_TOKENS ?? 2000)
  }
  if (payload.messages) built.messages = payload.messages
  if (payload.input) built.input = payload.input
  if (payload.format) {
    built.response_format = {
      type: 'text',
      text: { format: payload.format }
    }
  }
  return built
}
