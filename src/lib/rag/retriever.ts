import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import * as kvStore from '@/lib/kv-store'
import { structuredLog } from '@/lib/log'

interface RetrieveParams {
  documentId: string
  query: string
  k: number
  maxCharsPerChunk?: number
  userId?: string  // For KV security checks
  docHash?: string  // For cache coherence
}

interface RetrievedChunk {
  content: string
  page_number: number
  chunk_type?: string
  score?: number
}

/**
 * Expand query with synonyms for better matching
 */
function expandQuerySynonyms(query: string): string[] {
  const synonymMap = {
    'deal points': ['investment highlights', 'offering highlights', 'key terms', 'summary of terms'],
    'highlights': ['investment highlights', 'offering highlights', 'key points', 'key terms'],
    'key terms': ['deal points', 'terms summary', 'summary of terms', 'key highlights'],
    'summary': ['executive summary', 'deal summary', 'terms summary', 'at-a-glance'],
    'at-a-glance': ['summary', 'highlights', 'key points', 'deal points'],
    'transaction summary': ['deal summary', 'investment summary', 'offering summary'],
    'executive summary': ['summary', 'overview', 'highlights']
  }
  
  const lowerQuery = query.toLowerCase()
  const expandedTerms = [query] // Always include original
  
  for (const [term, synonyms] of Object.entries(synonymMap)) {
    if (lowerQuery.includes(term)) {
      expandedTerms.push(...synonyms)
    }
  }
  
  return [...new Set(expandedTerms)] // Remove duplicates
}

/**
 * Calculate relevance score for a chunk
 */
function calculateRelevanceScore(chunk: any, expandedQueries: string[]): number {
  const text = (chunk.text || chunk.content || '').toLowerCase()
  const page = chunk.page || chunk.page_number || 1
  let score = 0
  
  // Base scoring: term frequency
  for (const queryTerm of expandedQueries) {
    const termMatches = (text.match(new RegExp(queryTerm.toLowerCase(), 'g')) || []).length
    score += termMatches * 1.0
  }
  
  // Heading boost: check for h1-h3 patterns
  const headingPatterns = [
    /^#+\s*.*$/m,           // Markdown headers
    /^[A-Z][A-Z\s]{2,}$/m,  // ALL CAPS titles
    /^\d+\.\s*[A-Z]/m       // Numbered sections
  ]
  
  for (const pattern of headingPatterns) {
    if (pattern.test(text)) {
      for (const queryTerm of expandedQueries) {
        if (text.includes(queryTerm.toLowerCase())) {
          score += 2.0 // +2.0 heading boost
          break
        }
      }
      break
    }
  }
  
  // Early page boost: pages 1-6 get +1.5
  if (page <= 6) {
    score += 1.5
  }
  
  // Length penalty for very short chunks
  if (text.length < 50) {
    score *= 0.5
  }
  
  return score
}

/**
 * Find highlight-looking chunks by regex patterns
 */
function findHighlightChunks(chunks: any[], maxResults: number = 2): any[] {
  const highlightPatterns = [
    /investment.{0,20}highlights?/i,
    /offering.{0,20}highlights?/i,
    /executive.{0,20}summary/i,
    /key.{0,20}terms?/i,
    /deal.{0,20}points?/i,
    /transaction.{0,20}summary/i,
    /(?:^|\n)\s*(?:[•●▪▫◦‣⁃-]|\d+[\.)]).{10,}/gm // Bullet points or numbered lists
  ]
  
  const candidates: Array<{chunk: any, score: number}> = []
  
  for (const chunk of chunks) {
    const text = chunk.text || chunk.content || ''
    let patternScore = 0
    
    for (const pattern of highlightPatterns) {
      const matches = text.match(pattern)
      if (matches) {
        patternScore += matches.length
      }
    }
    
    if (patternScore > 0) {
      candidates.push({ chunk, score: patternScore })
    }
  }
  
  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(c => c.chunk)
}

/**
 * Remove duplicate adjacent chunks
 */
function deduplicateAdjacentChunks(chunks: RetrievedChunk[]): RetrievedChunk[] {
  if (chunks.length <= 1) return chunks
  
  const deduplicated: RetrievedChunk[] = [chunks[0]]
  
  for (let i = 1; i < chunks.length; i++) {
    const current = chunks[i]
    const previous = chunks[i - 1]
    
    // Skip if same page and similar content
    const isSamePage = current.page_number === previous.page_number
    const contentSimilarity = calculateContentSimilarity(current.content, previous.content)
    
    if (!(isSamePage && contentSimilarity > 0.7)) {
      deduplicated.push(current)
    }
  }
  
  return deduplicated
}

/**
 * Calculate content similarity between two strings
 */
function calculateContentSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/))
  const words2 = new Set(text2.toLowerCase().split(/\s+/))
  
  const intersection = new Set([...words1].filter(word => words2.has(word)))
  const union = new Set([...words1, ...words2])
  
  return intersection.size / union.size // Jaccard similarity
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
  maxCharsPerChunk = 1000,
  userId,
  docHash
}: RetrieveParams): Promise<RetrievedChunk[]> {
  // Limit k to 3 for performance
  const limitedK = Math.min(k, 3)
  
  // Expand query with synonyms
  const expandedQueries = expandQuerySynonyms(query)
  console.log(`[retrieveTopK] Expanded query: ${expandedQueries.join(', ')}`)
  
  // Check if this is a KV document (starts with "mem-")
  if (documentId.startsWith('mem-')) {
    console.log(`[retrieveTopK] Checking KV store for document: ${documentId}`)
    
    // Retrieve context from KV with retry logic
    const context = userId ? await kvStore.getContext(documentId, userId) : null
    
    if (context && context.chunks && context.chunks.length > 0) {
      console.log(`[retrieveTopK] Found ${context.chunks.length} chunks in KV store`)
      
      // Score all chunks using enhanced scoring
      const scoredChunks = context.chunks.map(chunk => ({
        ...chunk,
        score: calculateRelevanceScore(chunk, expandedQueries)
      }))
      
      // Sort by score and take top results
      const topChunks = scoredChunks
        .sort((a, b) => b.score - a.score)
        .slice(0, limitedK)
      
      // If no chunks have positive scores, fall back to highlight pattern search
      if (topChunks.every(chunk => chunk.score === 0)) {
        console.log(`[retrieveTopK] No scored matches, using highlight pattern fallback`)
        const highlightChunks = findHighlightChunks(context.chunks, 2)
        if (highlightChunks.length > 0) {
          return highlightChunks.map(chunk => ({
            content: chunk.text.slice(0, maxCharsPerChunk),
            page_number: chunk.page || 1,
            chunk_type: 'text',
            score: 1.0 // Baseline score for pattern matches
          }))
        }
        
        // Final fallback: first k chunks as before
        console.log(`[retrieveTopK] No pattern matches, returning first ${limitedK} chunks`)
        return context.chunks.slice(0, limitedK).map(chunk => ({
          content: chunk.text.slice(0, maxCharsPerChunk),
          page_number: chunk.page || 1,
          chunk_type: 'text',
          score: 0.1 // Minimal score for fallback
        }))
      }
      
      // Convert to result format and deduplicate
      const results = topChunks.map(chunk => ({
        content: chunk.text.slice(0, maxCharsPerChunk),
        page_number: chunk.page || 1,
        chunk_type: 'text',
        score: chunk.score
      }))
      
      const deduplicated = deduplicateAdjacentChunks(results)
      
      console.log(`[retrieveTopK] Returning ${deduplicated.length} scored and deduplicated chunks`)
      return deduplicated
    } else {
      console.log(`[retrieveTopK] No chunks found in KV store for ${documentId}`)
      
      // Log structured info for debugging
      structuredLog('info', 'No chunks found in KV', {
        documentId,
        userId: userId || 'unknown',
        kvRead: true,
        status: 'empty',
        requestId: `retrieve-${Date.now()}`
      })
      
      return []
    }
  }

  // For database documents, use enhanced retrieval logic
  const supabase = getSupabaseAdmin()
  
  // Try multiple query approaches in parallel
  const queryPromises = []
  
  // 1. Full-text search RPC with expanded queries
  for (const expandedQuery of expandedQueries.slice(0, 3)) { // Limit to top 3 expanded queries
    queryPromises.push(
      supabase.rpc('search_document_chunks', {
        p_document_ids: [documentId],
        p_query: expandedQuery,
        p_limit: limitedK
      }).then(result => ({ source: 'rpc', query: expandedQuery, ...result }))
    )
  }
  
  // 2. Direct ilike query
  queryPromises.push(
    supabase
      .from('document_chunks')
      .select('content,page_number,chunk_type')
      .eq('document_id', documentId)
      .ilike('content', `%${query}%`)
      .limit(limitedK * 2) // Get more for scoring
      .then(result => ({ source: 'ilike', query, ...result }))
  )
  
  try {
    const results = await Promise.allSettled(queryPromises)
    const allChunks: any[] = []
    
    // Collect all successful results
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.data && result.value.data.length > 0) {
        allChunks.push(...result.value.data.map((chunk: any) => ({
          content: chunk.content || '',
          page_number: chunk.page_number || 1,
          chunk_type: chunk.chunk_type || 'text',
          source: result.value.source
        })))
      }
    }
    
    if (allChunks.length > 0) {
      // Score and rank all chunks
      const scoredChunks = allChunks.map(chunk => ({
        ...chunk,
        score: calculateRelevanceScore(chunk, expandedQueries)
      }))
      
      // Sort by score and deduplicate
      const topChunks = scoredChunks
        .sort((a, b) => b.score - a.score)
        .slice(0, limitedK)
      
      const deduplicated = deduplicateAdjacentChunks(topChunks.map(chunk => ({
        content: chunk.content.slice(0, maxCharsPerChunk),
        page_number: chunk.page_number,
        chunk_type: chunk.chunk_type,
        score: chunk.score
      })))
      
      console.log(`[retrieveTopK] Database retrieval: ${deduplicated.length} chunks from ${allChunks.length} candidates`)
      return deduplicated
    }
  } catch (err) {
    console.warn('[retrieveTopK] Enhanced database search failed:', err)
  }

  // Final fallback: return first k chunks from document with early page preference
  const { data: anyData } = await supabase
    .from('document_chunks')
    .select('content,page_number,chunk_type')
    .eq('document_id', documentId)
    .order('page_number', { ascending: true }) // Prefer early pages
    .order('chunk_index', { ascending: true })
    .limit(limitedK)

  const fallbackResults = anyData?.map(d => ({
    content: (d.content || '').slice(0, maxCharsPerChunk),
    page_number: d.page_number,
    chunk_type: (d as any).chunk_type,
    score: d.page_number <= 6 ? 1.5 : 0.5 // Early page boost for fallback
  })) || []
  
  console.log(`[retrieveTopK] Fallback: ${fallbackResults.length} chunks (early pages preferred)`)
  return fallbackResults
}

/**
 * Get chunks for multiple document IDs, prioritizing memory documents
 */
export async function getChunksForDocIds(
  docIds: string[], 
  maxChunks: number = 8,
  userId: string // Required for KV security
): Promise<RetrievedChunk[]> {
  const maxChunksLimit = maxChunks || Number(process.env.CONTEXT_MAX_CHUNKS) || 4
  const allChunks: RetrievedChunk[] = []

  for (const docId of docIds) {
    if (allChunks.length >= maxChunksLimit) break

    // Memory documents from KV store
    if (docId.startsWith('mem-')) {
      console.log(`[getChunksForDocIds] Loading memory document: ${docId}`)
      
      try {
        const context = await kvStore.getContext(docId, userId)
        
        if (context && context.chunks && context.chunks.length > 0) {
          const remaining = maxChunksLimit - allChunks.length
          const memoryChunks = context.chunks.slice(0, remaining).map(chunk => ({
            content: chunk.text,
            page_number: chunk.page || 1,
            chunk_type: 'text'
          }))
          
          allChunks.push(...memoryChunks)
          console.log(`[getChunksForDocIds] Added ${memoryChunks.length} memory chunks from KV`)
        } else {
          console.log(`[getChunksForDocIds] No chunks found in KV for ${docId}`)
        }
      } catch (error) {
        console.error(`[getChunksForDocIds] Error retrieving from KV for ${docId}:`, error)
      }
    } else {
      // Database documents (future enhancement)
      console.log(`[getChunksForDocIds] Database documents not yet supported: ${docId}`)
    }
  }

  console.log(`[getChunksForDocIds] Total chunks loaded: ${allChunks.length}`)
  return allChunks
}
