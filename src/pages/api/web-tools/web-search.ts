import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { apiError } from '@/lib/auth-middleware'
import { checkRateLimit } from '@/lib/rate-limiter'

/**
 * Web Search API - Generic web search with rate limiting and auth
 * 
 * Searches the web using Serper or Brave API and returns structured results
 * with title, URL, and snippet for each result.
 */

export interface WebSearchParams {
  query: string
  n?: number // Number of results (max 10)
}

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
}

export interface WebSearchResponse {
  query: string
  results: WebSearchResult[]
  totalResults: number
  searchTime: number
}

async function webSearchHandler(req: NextApiRequest, res: NextApiResponse) {
  const requestId = `search-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
  const startTime = Date.now()

  try {
    if (req.method !== 'POST') {
      return apiError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED')
    }

    // Feature flag check
    if (process.env.NEXT_FEATURE_WEB_TOOLS !== 'true') {
      return apiError(res, 501, 'Web tools feature is disabled', 'FEATURE_DISABLED')
    }

    // Auth check - extract Bearer token
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return apiError(res, 401, 'No authorization token provided', 'NO_TOKEN')
    }

    const token = authHeader.replace('Bearer ', '')
    
    // Verify token with Supabase
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    
    if (authError || !user) {
      return apiError(res, 401, 'Invalid authorization token', 'BAD_TOKEN')
    }

    // Rate limiting check
    const rateLimitResult = await checkRateLimit(user.id, {
      endpoint: 'web-tools',
      maxRequests: 30,
      windowMinutes: 60
    })

    if (!rateLimitResult.allowed) {
      return apiError(res, 429, 'Rate limit exceeded', 'RATE_LIMIT')
    }

    // Validate request parameters
    const { query, n = 5 } = req.body as WebSearchParams
    
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return apiError(res, 400, 'Query parameter is required', 'INVALID_PARAMS')
    }

    if (typeof n !== 'number' || n < 1 || n > 10) {
      return apiError(res, 400, 'Number of results must be between 1 and 10', 'INVALID_PARAMS')
    }

    console.log(`[${requestId}] Web search request:`, {
      query: query.substring(0, 100),
      numResults: n,
      userId: user.id
    })

    // Check for API keys
    const serperKey = process.env.SERPER_API_KEY
    const braveKey = process.env.BRAVE_API_KEY
    
    if (!serperKey && !braveKey) {
      console.warn(`[${requestId}] No search API keys available`)
      return apiError(res, 503, 'Search service temporarily unavailable', 'NO_API_KEY')
    }

    let searchResults: WebSearchResult[] = []
    
    // Try Serper first, then Brave as fallback
    if (serperKey) {
      try {
        searchResults = await searchWithSerper(query, n, serperKey)
      } catch (error) {
        console.error(`[${requestId}] Serper search failed:`, error)
        if (braveKey) {
          searchResults = await searchWithBrave(query, n, braveKey)
        } else {
          throw error
        }
      }
    } else if (braveKey) {
      searchResults = await searchWithBrave(query, n, braveKey)
    }

    const searchTime = Date.now() - startTime
    
    const response: WebSearchResponse = {
      query,
      results: searchResults,
      totalResults: searchResults.length,
      searchTime
    }

    console.log(`[${requestId}] Web search completed:`, {
      resultsCount: searchResults.length,
      searchTimeMs: searchTime
    })

    res.status(200).json({
      success: true,
      data: response,
      meta: {
        requestId,
        timestamp: new Date().toISOString()
      }
    })

  } catch (error) {
    const searchTime = Date.now() - startTime
    console.error(`[${requestId}] Web search error:`, error)
    
    return apiError(res, 500, 'Search failed', 'SEARCH_ERROR', 
      error instanceof Error ? error.message : 'Unknown error')
  }
}

async function searchWithSerper(query: string, n: number, apiKey: string): Promise<WebSearchResult[]> {
  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q: query,
      num: n
    }),
    signal: AbortSignal.timeout(10000) // 10s timeout
  })

  if (!response.ok) {
    throw new Error(`Serper API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  
  return (data.organic || []).slice(0, n).map((result: any) => ({
    title: result.title || 'No title',
    url: result.link || '',
    snippet: result.snippet || 'No description available'
  }))
}

async function searchWithBrave(query: string, n: number, apiKey: string): Promise<WebSearchResult[]> {
  const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${n}`, {
    headers: {
      'X-Subscription-Token': apiKey,
      'Accept': 'application/json'
    },
    signal: AbortSignal.timeout(10000) // 10s timeout
  })

  if (!response.ok) {
    throw new Error(`Brave API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  
  return (data.web?.results || []).slice(0, n).map((result: any) => ({
    title: result.title || 'No title',
    url: result.url || '',
    snippet: result.description || 'No description available'
  }))
}

export default webSearchHandler