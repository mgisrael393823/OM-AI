import type { NextApiRequest, NextApiResponse } from 'next'
import { withAuth, apiError, AuthenticatedRequest } from '@/lib/auth-middleware'
import { isFeatureEnabled, requireFeature } from '@/lib/feature-flags'
import { MapPropertyVsCompsParamsSchema, type PropertyMappingResponse } from '@/lib/services/openai/functions/om-functions'

/**
 * Web Tools - Property vs Comparables Mapping API
 * 
 * Creates geographic analysis mapping subject property against comparable sales
 * with location adjustments, demographics, and transportation access.
 */

async function mapPropertyCompsHandler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return apiError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED')
  }

  try {
    // Validate request parameters
    const validation = MapPropertyVsCompsParamsSchema.safeParse(req.body)
    if (!validation.success) {
      return apiError(res, 400, 'Invalid parameters', 'INVALID_PARAMS', validation.error.message)
    }

    const params = validation.data
    console.log('[WEB-TOOLS] Property mapping request:', {
      subjectAddress: params.subjectAddress,
      comparablesCount: params.comparables.length,
      mapRadius: params.mapRadius,
      userId: req.user.id
    })

    // Simulate geocoding and mapping (replace with real API integration)
    const mockResponse: PropertyMappingResponse = {
      subjectProperty: {
        address: params.subjectAddress,
        coordinates: { lat: 40.7589, lng: -73.9851 }, // Mock NYC coordinates
        walkScore: 89,
        transitScore: 92
      },
      comparables: params.comparables.map((comp, index) => ({
        address: comp.address,
        coordinates: { 
          lat: 40.7589 + (Math.random() - 0.5) * 0.02, 
          lng: -73.9851 + (Math.random() - 0.5) * 0.02 
        },
        distance: Math.round((Math.random() * params.mapRadius) * 100) / 100,
        salePrice: comp.salePrice,
        pricePerSqFt: Math.round(comp.salePrice / comp.sqFt),
        capRate: comp.capRate,
        adjustedValue: Math.round(comp.salePrice * (0.95 + Math.random() * 0.1)),
        adjustmentFactors: [
          'Location premium: +5%',
          'Age adjustment: -2%',
          'Size adjustment: +3%'
        ]
      })),
      demographics: {
        population: 125000,
        medianIncome: 85000,
        employmentRate: 94.2,
        majorEmployers: [
          'Financial Services (32%)',
          'Technology (18%)',
          'Healthcare (15%)',
          'Professional Services (12%)'
        ]
      },
      transportation: {
        transitLines: ['Red Line', 'Blue Line'],
        nearestStation: '2 blocks',
        walkScore: 89,
        bikeScore: 76,
        highways: ['I-95', 'Route 1'],
        airports: [
          { name: 'Regional Airport', distance: 12 },
          { name: 'International Airport', distance: 28 }
        ]
      },
      analysis: {
        marketPosition: 'premium',
        locationScore: 8.7,
        comparabilityScore: 9.1,
        adjustmentSummary: 'Subject property commands 3-5% premium due to superior location and transit access'
      }
    }

    console.log('[WEB-TOOLS] Property mapping completed:', {
      subjectCoords: mockResponse.subjectProperty.coordinates,
      comparablesCount: mockResponse.comparables.length,
      walkScore: mockResponse.subjectProperty.walkScore
    })

    res.status(200).json({
      success: true,
      data: mockResponse,
      meta: {
        requestId: `mapping-${Date.now()}`,
        timestamp: new Date().toISOString(),
        mapUrl: `https://maps.example.com/embed?lat=${mockResponse.subjectProperty.coordinates.lat}&lng=${mockResponse.subjectProperty.coordinates.lng}&zoom=14`
      }
    })

  } catch (error) {
    console.error('[WEB-TOOLS] Property mapping error:', error)
    return apiError(res, 500, 'Property mapping failed', 'MAPPING_ERROR', 
      error instanceof Error ? error.message : 'Unknown error')
  }
}

// Apply feature flag protection and auth middleware
export default requireFeature('WEB_TOOLS')(withAuth(mapPropertyCompsHandler))