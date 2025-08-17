import { retrieveTopK } from '@/lib/rag/retriever'
import crypto from 'crypto'

// KV cache helpers for micro-caching (optional - only if KV is available)
let kvCache: any = null
// Disable KV caching for now - would require additional setup
// To enable: install @vercel/kv and configure VERCEL_KV_URL

// CRE risk synonyms and key terms for query expansion
const CRE_TERMS = {
  financial: ['rent', 'revenue', 'income', 'NOI', 'cap rate', 'cash flow', 'expenses', 'operating', 'EBITDA'],
  debt: ['loan', 'mortgage', 'financing', 'debt', 'leverage', 'LTV', 'DSCR', 'interest', 'maturity'],
  market: ['market', 'submarket', 'comparable', 'comps', 'location', 'demographic', 'trends', 'growth'],
  physical: ['unit', 'square feet', 'sf', 'mix', 'bedroom', 'bath', 'layout', 'amenities', 'condition'],
  assumptions: ['assumption', 'projection', 'forecast', 'growth', 'vacancy', 'turnover', 'exit']
}

// Heuristic section keywords for fallback retrieval
const HEURISTIC_SECTIONS = [
  'financial summary',
  'rent roll', 
  'operating expenses',
  'debt assumptions',
  'market analysis',
  'unit mix',
  'property details',
  'investment summary'
]

function buildEnhancedQuery(lastUserMsg: string, recentContext: string): string {
  const q = lastUserMsg.toLowerCase();
  const expanded = q
    .replace(/\byear[- ]?1\b/gi, 'year 1 y1 yr 1')
    .replace(/\bnoi\b/gi, 'noi net operating income');
  
  // Add context from recent messages
  let enhancedQuery = lastUserMsg
  if (recentContext && recentContext !== lastUserMsg) {
    enhancedQuery += ' ' + recentContext
  }
  
  // Add relevant CRE synonyms based on detected topics (using expanded query)
  const synonyms: string[] = []
  
  Object.entries(CRE_TERMS).forEach(([category, terms]) => {
    if (terms.some(term => expanded.includes(term))) {
      synonyms.push(...terms.filter(term => !expanded.includes(term)).slice(0, 2))
    }
  })
  
  if (synonyms.length > 0) {
    enhancedQuery += ' ' + synonyms.join(' ')
  }
  
  console.log('[CONV-RETRIEVER] Enhanced query:', {
    original: lastUserMsg,
    enhanced: enhancedQuery,
    addedSynonyms: synonyms
  })
  
  return enhancedQuery
}

async function fallbackHeuristicRetrieval(documentId: string): Promise<any[]> {
  console.log('[CONV-RETRIEVER] Attempting heuristic fallback retrieval')
  
  const fallbackChunks: any[] = []
  
  // Try each heuristic section
  for (const section of HEURISTIC_SECTIONS) {
    try {
      const chunks = await retrieveTopK({
        documentId,
        query: section,
        k: 2, // Only 2 chunks per section to avoid overwhelming
        maxCharsPerChunk: 1200 // Reduced for faster processing
      })
      
      if (chunks?.length > 0) {
        fallbackChunks.push(...chunks)
        console.log(`[CONV-RETRIEVER] Found ${chunks.length} chunks for: ${section}`)
      }
    } catch (error) {
      console.warn(`[CONV-RETRIEVER] Failed to retrieve for section: ${section}`, error)
    }
  }
  
  return fallbackChunks
}

export async function getRelevantChunks(documentId: string, messages: any[]) {
  if (!documentId || !messages?.length) return []
  
  // Get last user message and recent context
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
  if (!lastUserMsg) return []
  
  // Build context from recent conversation (last 3 messages)
  const recentMessages = messages.slice(-3)
  const recentContext = recentMessages
    .filter(m => m.role === 'user' && m.content !== lastUserMsg.content)
    .map(m => m.content)
    .join(' ')

  try {
    // Build enhanced query with context and synonyms
    const enhancedQuery = buildEnhancedQuery(lastUserMsg.content, recentContext)
    
    console.log('[CONV-RETRIEVER] Primary retrieval attempt:', {
      documentId,
      queryLength: enhancedQuery.length,
      messageCount: messages.length
    })
    
    // Try micro-cache first (60s cache for repeat queries)
    const cacheKey = `rt:${documentId}:${hashQuery(enhancedQuery)}`
    let chunks: any[] = []
    
    try {
      const cached = await getCachedChunks(cacheKey)
      if (cached) {
        console.log('[CONV-RETRIEVER] Cache hit')
        return cached
      }
    } catch (error) {
      // Ignore cache errors, continue with retrieval
      console.log('[CONV-RETRIEVER] Cache miss, continuing with retrieval')
    }

    // Primary retrieval with enhanced query
    // Environment-configurable chunk limits for performance (default to 4 for speed)
    const maxChunks = Number(process.env.CONTEXT_MAX_CHUNKS) || 4
    chunks = await retrieveTopK({
      documentId,
      query: enhancedQuery,
      k: maxChunks,
      maxCharsPerChunk: 1000 // Reduced for faster processing
    })

    console.log(`[CONV-RETRIEVER] Primary retrieval found ${chunks?.length || 0} chunks`)
    
    // If no chunks found, try fallback heuristic retrieval
    let finalChunks = chunks || []
    if (!finalChunks.length) {
      console.log('[CONV-RETRIEVER] No chunks found, attempting heuristic fallback')
      finalChunks = await fallbackHeuristicRetrieval(documentId)
    }
    
    if (!finalChunks.length) {
      console.warn('[CONV-RETRIEVER] No chunks found even with fallback - document may be empty')
      return []
    }

    // Dedupe by page and prioritize longer, more complete chunks
    const byPage = new Map<number, { content: string; page: number }>()
    for (const c of finalChunks) {
      const chunk = c as any // Handle dynamic property access from different retrievers
      const raw = chunk.page ?? chunk.page_number ?? chunk.pageNumber ?? chunk.pageNum ?? chunk.pageIndex
      const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw)
      const page = Number.isFinite(n) && n >= 0 ? n : 0
      const text = String(chunk.content ?? chunk.text ?? '').trim()
      if (!text) continue
      const prev = byPage.get(page)?.content?.length ?? 0
      if (text.length > prev) byPage.set(page, { content: text, page })
    }

    // Sort by page and limit to environment-configured chunks (default to 4 for speed)
    const maxFinalChunks = Number(process.env.CONTEXT_MAX_CHUNKS) || 4
    const sortedChunks = Array.from(byPage.values())
      .sort((a, b) => a.page - b.page)
      .slice(0, maxFinalChunks)
    
    console.log('[CONV-RETRIEVER] Final selection:', {
      totalFound: finalChunks.length,
      uniquePages: byPage.size,
      finalCount: sortedChunks.length,
      pages: sortedChunks.map(c => c.page)
    })

    // Cache the result (fire and forget)
    cacheChunks(cacheKey, sortedChunks).catch(() => {})

    return sortedChunks
  } catch (error) {
    console.error('[CONV-RETRIEVER] Error in retrieval:', error)
    return []
  }
}

// Helper functions for micro-caching
function hashQuery(query: string): string {
  return crypto.createHash('md5').update(query).digest('hex').substring(0, 8)
}

async function getCachedChunks(cacheKey: string): Promise<any[] | null> {
  if (!kvCache) return null
  
  try {
    return await kvCache.get(cacheKey)
  } catch (error) {
    console.warn('[CONV-RETRIEVER] Cache read error:', error)
    return null
  }
}

async function cacheChunks(cacheKey: string, chunks: any[]): Promise<void> {
  if (!kvCache || !chunks?.length) return
  
  try {
    // Cache for 60 seconds with sliding expiration
    await kvCache.set(cacheKey, chunks, { ex: 60 })
    console.log(`[CONV-RETRIEVER] Cached ${chunks.length} chunks for key ${cacheKey}`)
  } catch (error) {
    console.warn('[CONV-RETRIEVER] Cache write error:', error)
  }
}