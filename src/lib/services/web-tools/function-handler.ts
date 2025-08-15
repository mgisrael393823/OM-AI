/**
 * Web Tools Function Handler
 * 
 * Handles function calls for live market data search and property mapping
 * when the WEB_TOOLS feature flag is enabled.
 */

import { isFeatureEnabled } from '@/lib/feature-flags'
import type { 
  SearchMarketDataParams, 
  MapPropertyVsCompsParams,
  MarketDataResponse,
  PropertyMappingResponse 
} from '@/lib/services/openai/functions/om-functions'

export interface WebToolsFunction {
  name: 'search_market_data' | 'map_property_vs_comps'
  arguments: SearchMarketDataParams | MapPropertyVsCompsParams
}

export interface WebToolsResponse {
  functionName: string
  success: boolean
  data?: MarketDataResponse | PropertyMappingResponse
  error?: string
}

/**
 * Execute web tools function calls
 */
export async function executeWebToolsFunction(
  functionCall: WebToolsFunction,
  authToken: string,
  baseUrl: string = 'http://localhost:3000'
): Promise<WebToolsResponse> {
  
  // Check if web tools are enabled
  if (!isFeatureEnabled('WEB_TOOLS')) {
    return {
      functionName: functionCall.name,
      success: false,
      error: 'Web tools feature is not enabled'
    }
  }

  try {
    let endpoint: string
    
    switch (functionCall.name) {
      case 'search_market_data':
        endpoint = '/api/web-tools/search-market-data'
        break
      case 'map_property_vs_comps':
        endpoint = '/api/web-tools/map-property-comps'
        break
      default:
        return {
          functionName: functionCall.name,
          success: false,
          error: `Unknown function: ${functionCall.name}`
        }
    }

    console.log(`[WEB-TOOLS] Executing function: ${functionCall.name}`)

    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify(functionCall.arguments),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`HTTP ${response.status}: ${errorData.error || response.statusText}`)
    }

    const result = await response.json()
    
    console.log(`[WEB-TOOLS] Function ${functionCall.name} completed successfully`)

    return {
      functionName: functionCall.name,
      success: true,
      data: result.data
    }

  } catch (error) {
    console.error(`[WEB-TOOLS] Function ${functionCall.name} failed:`, error)
    
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
    case 'search_market_data':
      const marketData = response.data as MarketDataResponse
      return formatMarketDataResponse(marketData)
      
    case 'map_property_vs_comps':
      const mappingData = response.data as PropertyMappingResponse
      return formatPropertyMappingResponse(mappingData)
      
    default:
      return `Web Tools Response: ${JSON.stringify(response.data)}`
  }
}

function formatMarketDataResponse(data: MarketDataResponse): string {
  const metrics = data.dataPoints.map(dp => 
    `${dp.metric}: ${dp.value}${dp.unit} (${Math.round(dp.confidence * 100)}% confidence)`
  ).join(', ')
  
  const comps = data.comparableProperties.map(comp =>
    `${comp.address}: $${comp.salePrice.toLocaleString()} (${comp.capRate}% cap, $${comp.pricePerSqFt}/sf)`
  ).join('\n')
  
  return `Market Data for ${data.submarket} (${data.propertyType}):

Key Metrics: ${metrics}

Recent Comparable Sales:
${comps}

Market Outlook: ${data.forecast.outlook} (vacancy trending ${data.forecast.vacancyRate}%, rent growth ${data.forecast.rentGrowth}%)`
}

function formatPropertyMappingResponse(data: PropertyMappingResponse): string {
  const subject = data.subjectProperty
  const demographics = data.demographics
  
  const comps = data.comparables.map(comp =>
    `${comp.address}: $${comp.salePrice.toLocaleString()} (${comp.distance}mi away, adjusted: $${comp.adjustedValue.toLocaleString()})`
  ).join('\n')
  
  return `Property Location Analysis for ${subject.address}:

Location Scores: Walk Score ${subject.walkScore}, Transit Score ${subject.transitScore}
Demographics: Population ${demographics.population.toLocaleString()}, Median Income $${demographics.medianIncome.toLocaleString()}

Comparable Properties:
${comps}

Analysis: ${data.analysis.comparabilityScore}/10 comparability score. ${data.analysis.adjustmentSummary}`
}