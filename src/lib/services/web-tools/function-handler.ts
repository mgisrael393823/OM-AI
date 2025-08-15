/**
 * Web Tools Function Handler
 * 
 * Handles function calls for generic web search and page fetching
 * when the WEB_TOOLS feature flag is enabled.
 */

import { isFeatureEnabled } from '@/lib/feature-flags'

export interface WebSearchParams {
  query: string
  n?: number
}

export interface FetchPageParams {
  url: string
}

export interface WebToolsFunction {
  name: 'web_search' | 'fetch_page'
  arguments: WebSearchParams | FetchPageParams
}

export interface WebToolsResponse {
  functionName: string
  success: boolean
  data?: any
  error?: string
}

export interface ToolBudget {
  searchCalls: number
  fetchCalls: number
  maxSearchCalls: number
  maxFetchCalls: number
}

// Global budget tracker per request (reset for each request)
let requestBudget: ToolBudget = {
  searchCalls: 0,
  fetchCalls: 0,
  maxSearchCalls: 2,
  maxFetchCalls: 6
}

export function resetToolBudget(): void {
  requestBudget = {
    searchCalls: 0,
    fetchCalls: 0,
    maxSearchCalls: 2,
    maxFetchCalls: 6
  }
}

export function getToolBudget(): ToolBudget {
  return { ...requestBudget }
}

/**
 * Execute web tools function calls with budget tracking
 */
export async function executeWebToolsFunction(
  functionCall: WebToolsFunction,
  authToken: string,
  baseUrl: string = 'http://localhost:3000'
): Promise<WebToolsResponse> {
  const startTime = Date.now()
  
  // Check if web tools are enabled
  if (!isFeatureEnabled('WEB_TOOLS')) {
    return {
      functionName: functionCall.name,
      success: false,
      error: 'Web tools feature is not enabled'
    }
  }

  // Check budget before execution
  if (functionCall.name === 'web_search' && requestBudget.searchCalls >= requestBudget.maxSearchCalls) {
    return {
      functionName: functionCall.name,
      success: false,
      error: `Search budget exceeded (max ${requestBudget.maxSearchCalls} calls per request)`
    }
  }

  if (functionCall.name === 'fetch_page' && requestBudget.fetchCalls >= requestBudget.maxFetchCalls) {
    return {
      functionName: functionCall.name,
      success: false,
      error: `Fetch budget exceeded (max ${requestBudget.maxFetchCalls} calls per request)`
    }
  }

  try {
    let endpoint: string
    
    switch (functionCall.name) {
      case 'web_search':
        endpoint = '/api/web-tools/web-search'
        requestBudget.searchCalls++
        break
      case 'fetch_page':
        endpoint = '/api/web-tools/fetch-page'
        requestBudget.fetchCalls++
        break
      default:
        return {
          functionName: functionCall.name,
          success: false,
          error: `Unknown function: ${functionCall.name}`
        }
    }

    console.log(`[WEB-TOOLS] Executing function: ${functionCall.name}`, {
      budget: getToolBudget(),
      args: functionCall.arguments
    })

    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify(functionCall.arguments),
      signal: AbortSignal.timeout(12000) // 12s timeout for the full request
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`HTTP ${response.status}: ${errorData.error || response.statusText}`)
    }

    const result = await response.json()
    const executionTime = Date.now() - startTime
    
    console.log(`[WEB-TOOLS] Function ${functionCall.name} completed successfully`, {
      executionTimeMs: executionTime,
      budget: getToolBudget()
    })

    return {
      functionName: functionCall.name,
      success: true,
      data: result.data
    }

  } catch (error) {
    const executionTime = Date.now() - startTime
    console.error(`[WEB-TOOLS] Function ${functionCall.name} failed:`, error, {
      executionTimeMs: executionTime,
      budget: getToolBudget()
    })
    
    return {
      functionName: functionCall.name,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Format web tools response for chat context
 */
export function formatWebToolsResponse(response: WebToolsResponse): string {
  if (!response.success) {
    return `Web Tools Error (${response.functionName}): ${response.error}`
  }

  switch (response.functionName) {
    case 'web_search':
      return formatWebSearchResponse(response.data)
      
    case 'fetch_page':
      return formatFetchPageResponse(response.data)
      
    default:
      return `Web Tools Response: ${JSON.stringify(response.data)}`
  }
}

function formatWebSearchResponse(data: any): string {
  if (!data?.results || !Array.isArray(data.results)) {
    return 'No search results found'
  }

  const results = data.results.map((result: any, index: number) => 
    `${index + 1}. [${result.title || 'No title'}](${result.url})\n   ${result.snippet || 'No description'}`
  ).join('\n\n')

  return `Search Results for "${data.query}":\n\n${results}`
}

function formatFetchPageResponse(data: any): string {
  if (!data?.content) {
    return 'No page content available'
  }

  const title = data.title || 'No title'
  const url = data.url || ''
  const content = data.content.length > 2000 ? 
    data.content.substring(0, 2000) + '...' : 
    data.content

  return `Page Content: [${title}](${url})\n\n${content}`
}