import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { transientStore } from '@/lib/transient-store'

interface RetrieveParams {
  documentId: string
  query: string
  k: number
  maxCharsPerChunk?: number
}

interface RetrievedChunk {
  content: string
  page_number: number
  chunk_type?: string
}

/**
 * Retrieve top K document chunks matching a query for a given document.
 * Attempts to use the `search_document_chunks` RPC, falling back to a simple
 * `ilike` query on the `document_chunks` table if the RPC fails or returns no
 * results.
 */
export async function retrieveTopK({
  documentId,
  query,
  k,
  maxCharsPerChunk = 1000
}: RetrieveParams): Promise<RetrievedChunk[]> {
  // Check if this is an in-memory document (starts with "mem-")
  if (documentId.startsWith('mem-')) {
    console.log(`[retrieveTopK] Checking transient store for document: ${documentId}`)
    const chunks = transientStore.getChunks(documentId)
    
    if (chunks && chunks.length > 0) {
      console.log(`[retrieveTopK] Found ${chunks.length} chunks in transient store`)
      
      // For in-memory documents, try to find relevant chunks but always return something
      // since these are temporary uploads meant for immediate context
      let filteredChunks = chunks.filter(chunk => 
        chunk.text.toLowerCase().includes(query.toLowerCase())
      ).slice(0, k)
      
      // If no chunks match the query, return the first k chunks as fallback
      if (filteredChunks.length === 0) {
        console.log(`[retrieveTopK] No chunks matched query "${query}", returning first ${k} chunks as context`)
        filteredChunks = chunks.slice(0, k)
      }
      
      return filteredChunks.map(chunk => ({
        content: chunk.text.slice(0, maxCharsPerChunk),
        page_number: chunk.page || 1,
        chunk_type: 'text'
      }))
    } else {
      console.log(`[retrieveTopK] No chunks found in transient store for ${documentId}`)
      return []
    }
  }

  // For database documents, use the existing logic
  // First try the full-text search RPC
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase.rpc('search_document_chunks', {
      p_document_ids: [documentId],
      p_query: query,
      p_limit: k
    })

    if (error) {
      console.warn('[retrieveTopK] search_document_chunks error:', error.message)
    } else if (data && data.length) {
      return data.map((d: any) => ({
        content: (d.content || '').slice(0, maxCharsPerChunk),
        page_number: d.page_number,
        chunk_type: d.chunk_type
      }))
    }
  } catch (err) {
    console.warn('[retrieveTopK] search_document_chunks failed, falling back to direct query', err)
  }

  // Fallback: direct query on document_chunks table using ilike
  const supabase = getSupabaseAdmin()
  const { data: tableData, error: tableError } = await supabase
    .from('document_chunks')
    .select('content,page_number,chunk_type')
    .eq('document_id', documentId)
    .ilike('content', `%${query}%`)
    .limit(k)

  if (tableError) {
    console.error('[retrieveTopK] fallback query error:', tableError.message)
    return []
  }

  if (tableData && tableData.length) {
    return tableData.map(d => ({
      content: (d.content || '').slice(0, maxCharsPerChunk),
      page_number: d.page_number,
      chunk_type: (d as any).chunk_type
    }))
  }

  // Final fallback: return first k chunks from document
  const { data: anyData } = await supabase
    .from('document_chunks')
    .select('content,page_number,chunk_type')
    .eq('document_id', documentId)
    .order('chunk_index')
    .limit(k)

  return (
    anyData?.map(d => ({
      content: (d.content || '').slice(0, maxCharsPerChunk),
      page_number: d.page_number,
      chunk_type: (d as any).chunk_type
    })) || []
  )
}

/**
 * Get chunks for multiple document IDs, prioritizing memory documents
 */
export async function getChunksForDocIds(
  docIds: string[], 
  maxChunks?: number
): Promise<RetrievedChunk[]> {
  const maxChunksLimit = maxChunks || Number(process.env.CONTEXT_MAX_CHUNKS) || 4
  const allChunks: RetrievedChunk[] = []

  for (const docId of docIds) {
    if (allChunks.length >= maxChunksLimit) break

    // Memory documents first (transient store)
    if (docId.startsWith('mem-')) {
      console.log(`[getChunksForDocIds] Loading memory document: ${docId}`)
      const chunks = transientStore.getChunks(docId)
      
      if (chunks && chunks.length > 0) {
        const remaining = maxChunksLimit - allChunks.length
        const memoryChunks = chunks.slice(0, remaining).map(chunk => ({
          content: chunk.text,
          page_number: chunk.page || 1,
          chunk_type: 'text'
        }))
        
        allChunks.push(...memoryChunks)
        console.log(`[getChunksForDocIds] Added ${memoryChunks.length} memory chunks`)
      }
    } else {
      // Database documents (future enhancement - would need KV lookup for version)
      console.log(`[getChunksForDocIds] Database documents not yet supported: ${docId}`)
    }
  }

  console.log(`[getChunksForDocIds] Total chunks loaded: ${allChunks.length}`)
  return allChunks
}
