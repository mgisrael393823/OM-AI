import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { apiError } from '@/lib/auth-middleware'
import { checkRateLimit } from '@/lib/rate-limiter'
import { URL } from 'url'

/**
 * Fetch Page API - SSRF-safe page content fetching
 * 
 * Fetches and extracts readable content from web pages using Firecrawl
 * or direct fetch + readability extraction with strict security controls.
 */

export interface FetchPageParams {
  url: string
}

export interface FetchPageResult {
  title: string
  url: string
  content: string
}

async function fetchPageHandler(req: NextApiRequest, res: NextApiResponse) {
  const requestId = `fetch-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
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

    // Validate and sanitize URL
    const { url } = req.body as FetchPageParams
    
    const urlValidation = validateUrl(url)
    if (!urlValidation.valid) {
      return apiError(res, 400, urlValidation.error || 'Invalid URL', 'INVALID_URL')
    }

    const sanitizedUrl = urlValidation.url!

    console.log(`[${requestId}] Fetch page request:`, {
      url: sanitizedUrl,
      userId: user.id
    })

    // Check for API keys
    const firecrawlKey = process.env.FIRECRAWL_API_KEY
    
    let result: FetchPageResult

    if (firecrawlKey) {
      try {
        result = await fetchWithFirecrawl(sanitizedUrl, firecrawlKey)
      } catch (error) {
        console.warn(`[${requestId}] Firecrawl failed, falling back to direct fetch:`, error)
        result = await fetchDirect(sanitizedUrl)
      }
    } else {
      result = await fetchDirect(sanitizedUrl)
    }

    const fetchTime = Date.now() - startTime

    console.log(`[${requestId}] Fetch page completed:`, {
      url: sanitizedUrl,
      contentLength: result.content.length,
      fetchTimeMs: fetchTime
    })

    res.status(200).json({
      success: true,
      data: result,
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        fetchTimeMs: fetchTime
      }
    })

  } catch (error) {
    const fetchTime = Date.now() - startTime
    console.error(`[${requestId}] Fetch page error:`, error)
    
    return apiError(res, 500, 'Page fetch failed', 'FETCH_ERROR', 
      error instanceof Error ? error.message : 'Unknown error')
  }
}

function validateUrl(urlString: string): { valid: boolean; url?: string; error?: string } {
  if (!urlString || typeof urlString !== 'string') {
    return { valid: false, error: 'URL is required' }
  }

  // Check URL length
  if (urlString.length > 2048) {
    return { valid: false, error: 'URL too long (max 2048 characters)' }
  }

  let url: URL
  try {
    url = new URL(urlString)
  } catch {
    return { valid: false, error: 'Invalid URL format' }
  }

  // Only allow http/https
  if (!['http:', 'https:'].includes(url.protocol)) {
    return { valid: false, error: 'Only HTTP and HTTPS protocols are allowed' }
  }

  // Require hostname
  if (!url.hostname) {
    return { valid: false, error: 'URL must include hostname' }
  }

  // SSRF protection - block private/loopback/link-local addresses
  const hostname = url.hostname.toLowerCase()
  
  // Block localhost variants
  if (['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    return { valid: false, error: 'Access to localhost is not permitted' }
  }

  // Block private IP ranges
  const privateRanges = [
    /^10\./,           // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[01])\./,  // 172.16.0.0/12
    /^192\.168\./,     // 192.168.0.0/16
    /^169\.254\./,     // 169.254.0.0/16 (link-local)
    /^fc00:/,          // fc00::/7 (unique local)
    /^fe80:/           // fe80::/10 (link-local)
  ]

  for (const range of privateRanges) {
    if (range.test(hostname)) {
      return { valid: false, error: 'Access to private/internal networks is not permitted' }
    }
  }

  return { valid: true, url: url.toString() }
}

async function fetchWithFirecrawl(url: string, apiKey: string): Promise<FetchPageResult> {
  const response = await fetch('https://api.firecrawl.dev/v0/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      formats: ['markdown'],
      onlyMainContent: true
    }),
    signal: AbortSignal.timeout(10000) // 10s timeout
  })

  if (!response.ok) {
    throw new Error(`Firecrawl API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  
  if (!data.success) {
    throw new Error(`Firecrawl scraping failed: ${data.error || 'Unknown error'}`)
  }

  return {
    title: data.data?.metadata?.title || 'No title',
    url,
    content: data.data?.markdown || data.data?.content || 'No content available'
  }
}

async function fetchDirect(url: string): Promise<FetchPageResult> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; OM-AI/1.0; +https://om-ai.com)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    },
    signal: AbortSignal.timeout(10000) // 10s timeout
  })

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status} ${response.statusText}`)
  }

  const html = await response.text()
  
  // Simple content extraction (basic readability)
  const title = extractTitle(html)
  const content = extractContent(html)

  return {
    title: title || 'No title',
    url,
    content: content || 'No content available'
  }
}

function extractTitle(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return titleMatch?.[1]?.trim() || ''
}

function extractContent(html: string): string {
  // Remove script and style tags
  let content = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
  
  // Extract text from common content tags
  const contentMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (contentMatch) {
    content = contentMatch[1]
  }

  // Remove HTML tags and decode entities
  content = content.replace(/<[^>]+>/g, ' ')
  content = content.replace(/&nbsp;/g, ' ')
  content = content.replace(/&amp;/g, '&')
  content = content.replace(/&lt;/g, '<')
  content = content.replace(/&gt;/g, '>')
  content = content.replace(/&quot;/g, '"')
  content = content.replace(/&#39;/g, "'")

  // Clean up whitespace
  content = content.replace(/\s+/g, ' ').trim()

  // Limit content length
  if (content.length > 10000) {
    content = content.substring(0, 10000) + '...'
  }

  return content
}

export default fetchPageHandler