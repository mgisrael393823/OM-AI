interface Chunk {
  content: string
  page_number: number
}

export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * Builds a context string from document chunks with page markers.
 * The result is trimmed to the specified maximum length (default ~8k chars).
 */
export function buildContextBlock(chunks: Chunk[], maxChars = 8000): string {
  let context = 'Context:\n'
  for (const chunk of chunks) {
    const snippet = `[p${chunk.page_number}] ${chunk.content}`.trim()
    if (context.length + snippet.length + 1 > maxChars) break
    context += snippet + '\n'
  }
  return context.trim()
}

/**
 * Prepends context to message arrays for both Chat and Responses APIs.
 */
export function augmentMessagesWithContext(
  chunks: Chunk[],
  messages: Message[]
) {
  const contextMessage: Message = {
    role: 'system',
    content: buildContextBlock(chunks)
  }
  return {
    chat: [contextMessage, ...messages],
    responses: [contextMessage, ...messages]
  }
}
