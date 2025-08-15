import type { NextApiRequest, NextApiResponse } from 'next'
import { withAuth, apiError, AuthenticatedRequest } from '@/lib/auth-middleware'
import { isFeatureEnabled, requireFeature } from '@/lib/feature-flags'
import { SearchMarketDataParamsSchema, type MarketDataResponse } from '@/lib/services/openai/functions/om-functions'

/**
 * Web Tools - Market Data Search API
 * 
 * Searches for live market data including comparables, vacancy rates,
 * cap rates, and market trends for commercial real estate analysis.
 */

async function searchMarketDataHandler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return apiError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED')
  }

  try {
    // Validate request parameters
    const validation = SearchMarketDataParamsSchema.safeParse(req.body)
    if (!validation.success) {
      return apiError(res, 400, 'Invalid parameters', 'INVALID_PARAMS', validation.error.message)
    }

    const params = validation.data
    console.log('[WEB-TOOLS] Market data search request:', {
      submarket: params.submarket,
      propertyType: params.propertyType,
      radiusMiles: params.radiusMiles,
      userId: req.user.id
    })

    // Simulate market data search (replace with real API integration)
    const mockResponse: MarketDataResponse = {
      submarket: params.submarket,
      propertyType: params.propertyType,
      dataPoints: [
        {
          metric: 'vacancy_rate',
          value: 8.5,
          unit: 'percentage',
          date: new Date().toISOString(),
          source: 'CoStar',
          confidence: 0.85
        },
        {
          metric: 'avg_rent',
          value: 32.50,
          unit: 'per_sqft_year',
          date: new Date().toISOString(),
          source: 'CoStar',
          confidence: 0.90
        },
        {
          metric: 'cap_rate',
          value: 6.75,
          unit: 'percentage',
          date: new Date().toISOString(),
          source: 'RCA',
          confidence: 0.80
        }
      ],
      comparableProperties: [
        {
          address: '123 Market St, ' + params.submarket,
          salePrice: 12500000,
          saleDate: '2024-11-15',
          capRate: 6.5,
          pricePerSqFt: 450,
          distance: 0.3
        },
        {
          address: '456 Business Ave, ' + params.submarket,
          salePrice: 18200000,
          saleDate: '2024-10-22',
          capRate: 7.1,
          pricePerSqFt: 425,
          distance: 0.8
        }
      ],
      marketTrends: [
        {
          metric: 'vacancy_rate',
          direction: 'decreasing',
          percentage: -2.1,
          timeframe: '12_months'
        },
        {
          metric: 'avg_rent',
          direction: 'increasing',
          percentage: 4.2,
          timeframe: '12_months'
        }
      ],
      forecast: {
        vacancyRate: 7.8,
        rentGrowth: 3.5,
        capRateDirection: 'stable',
        outlook: 'positive'
      }
    }

    console.log('[WEB-TOOLS] Market data search completed:', {
      dataPoints: mockResponse.dataPoints.length,
      comparables: mockResponse.comparableProperties.length,
      trends: mockResponse.marketTrends.length
    })

    res.status(200).json({
      success: true,
      data: mockResponse,
      meta: {
        requestId: `market-${Date.now()}`,
        timestamp: new Date().toISOString(),
        cached: false
      }
    })

  } catch (error) {
    console.error('[WEB-TOOLS] Market data search error:', error)
    return apiError(res, 500, 'Market data search failed', 'SEARCH_ERROR', 
      error instanceof Error ? error.message : 'Unknown error')
  }
}

// Apply feature flag protection and auth middleware
export default requireFeature('WEB_TOOLS')(withAuth(searchMarketDataHandler))