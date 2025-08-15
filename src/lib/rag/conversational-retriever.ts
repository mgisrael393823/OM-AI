import { retrieveTopK } from '@/lib/rag/retriever'

export async function getRelevantChunks(documentId: string, messages: any[]) {
  if (!documentId || !messages?.length) return []
  
  // Use last user message as query
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
  if (!lastUserMsg) return []

  try {
    const chunks = await retrieveTopK({
      documentId,
      query: lastUserMsg.content,
      k: 8,
      maxCharsPerChunk: 1500
    })

    // Dedupe by page
    const byPage = new Map()
    chunks.forEach(c => {
      const page = c.page_number || 0
      if (!byPage.has(page) || c.content.length > byPage.get(page).content.length) {
        byPage.set(page, { content: c.content, page })
      }
    })

    return Array.from(byPage.values()).sort((a,b) => a.page - b.page)
  } catch (error) {
    console.error('[RETRIEVER] Error:', error)
    return []
  }
}