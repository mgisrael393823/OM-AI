import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { withAuth, AuthenticatedRequest, apiError } from '@/lib/auth-middleware'

interface SearchResult {
  documentId: string
  documentName: string
  chunkId: string
  content: string
  page: number
  type: string
  relevanceScore: number
  matchedTerms: string[]
}

async function searchHandler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return apiError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED')
  }

  const { q: query, documentId, type, page, limit = '20' } = req.query

  if (!query || typeof query !== 'string') {
    return apiError(res, 400, 'Search query is required', 'MISSING_QUERY')
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // Build base query
    let queryBuilder = supabase
      .from('document_chunks')
      .select(`
        *,
        documents!inner(id, name, user_id)
      `)
      .eq('documents.user_id', req.user.id)
      .textSearch('content', query)

    // Apply filters
    if (documentId && typeof documentId === 'string') {
      queryBuilder = queryBuilder.eq('document_id', documentId)
    }

    if (type && typeof type === 'string') {
      queryBuilder = queryBuilder.eq('chunk_type', type)
    }

    if (page && typeof page === 'string') {
      const pageNum = parseInt(page)
      if (!isNaN(pageNum)) {
        queryBuilder = queryBuilder.eq('page_number', pageNum)
      }
    }

    // Apply pagination
    const limitNum = Math.min(parseInt(limit as string) || 20, 100)
    queryBuilder = queryBuilder.limit(limitNum)

    const { data: chunks, error: searchError } = await queryBuilder

    if (searchError) {
      console.error('Search error:', searchError)
      return apiError(res, 500, 'Search failed', 'SEARCH_ERROR', searchError.message)
    }

    // Process and rank results
    const searchTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2)
    const results: SearchResult[] = []

    for (const chunk of chunks || []) {
      const content = chunk.content.toLowerCase()
      let relevanceScore = 0
      const matchedTerms: string[] = []

      // Simple relevance scoring
      for (const term of searchTerms) {
        const matches = (content.match(new RegExp(term, 'g')) || []).length
        if (matches > 0) {
          relevanceScore += matches
          matchedTerms.push(term)
        }
      }

      // Boost score for exact phrase matches
      if (content.includes(query.toLowerCase())) {
        relevanceScore += 10
      }

      // Boost score for chunk type
      if (chunk.chunk_type === 'header') {
        relevanceScore *= 1.5
      } else if (chunk.chunk_type === 'table') {
        relevanceScore *= 1.3
      }

      if (relevanceScore > 0) {
        results.push({
          documentId: chunk.document_id,
          documentName: chunk.documents.name,
          chunkId: chunk.chunk_id,
          content: chunk.content,
          page: chunk.page_number,
          type: chunk.chunk_type,
          relevanceScore,
          matchedTerms
        })
      }
    }

    // Sort by relevance score
    results.sort((a, b) => b.relevanceScore - a.relevanceScore)

    // Add highlighted excerpts
    const processedResults = results.map(result => {
      let excerpt = result.content
      
      // Create excerpt around first match
      const firstMatchIndex = excerpt.toLowerCase().indexOf(searchTerms[0])
      if (firstMatchIndex !== -1) {
        const start = Math.max(0, firstMatchIndex - 100)
        const end = Math.min(excerpt.length, firstMatchIndex + 300)
        excerpt = (start > 0 ? '...' : '') + 
                 excerpt.substring(start, end) + 
                 (end < excerpt.length ? '...' : '')
      } else if (excerpt.length > 400) {
        excerpt = excerpt.substring(0, 400) + '...'
      }

      // Highlight search terms
      for (const term of searchTerms) {
        const regex = new RegExp(`(${term})`, 'gi')
        excerpt = excerpt.replace(regex, '<mark>$1</mark>')
      }

      return {
        ...result,
        excerpt,
        content: undefined as any // Remove full content from response
      }
    })

    // Group results by document
    const documentGroups: { [key: string]: any[] } = {}
    for (const result of processedResults) {
      if (!documentGroups[result.documentId]) {
        documentGroups[result.documentId] = []
      }
      documentGroups[result.documentId].push(result)
    }

    return res.status(200).json({
      success: true,
      query,
      totalResults: results.length,
      results: processedResults,
      documentGroups: Object.entries(documentGroups).map(([docId, results]) => ({
        documentId: docId,
        documentName: results[0].documentName,
        resultCount: results.length,
        topResult: results[0]
      })),
      searchMetadata: {
        searchTerms,
        appliedFilters: {
          documentId: documentId as string,
          type: type as string,
          page: page as string
        }
      }
    })

  } catch (error) {
    console.error('Search error:', error)
    return apiError(res, 500, 'Search failed', 'SEARCH_ERROR',
      error instanceof Error ? error.message : 'Unknown error')
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return withAuth(req, res, searchHandler)
}