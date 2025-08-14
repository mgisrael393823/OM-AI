import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { withAuth, apiError, AuthenticatedRequest } from '@/lib/auth-middleware'
import { getConfig } from '@/lib/config'
import { getEnvironmentStatus } from '@/lib/startup-validation'
import type { Database } from '@/types/database'

interface HealthCheckResult {
  service: string
  status: 'healthy' | 'unhealthy'
  message: string
  timestamp: string
  details?: Record<string, any>
}

async function healthCheckHandler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return apiError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED')
  }

  const timestamp = new Date().toISOString()
  const results: HealthCheckResult[] = []

  try {
    // Test 1: Environment Variables (using startup validation)
    console.log('Health Check: Testing environment variables')
    const config = getConfig()
    const envStatus = getEnvironmentStatus()
    
    results.push({
      service: 'environment',
      status: envStatus.status === 'healthy' ? 'healthy' : 'unhealthy',
      message: envStatus.message,
      timestamp,
      details: {
        validationStatus: envStatus.status,
        errorCount: envStatus.details.errors.length,
        warningCount: envStatus.details.warnings.length,
        validatedVars: Object.keys(envStatus.details.details.validatedVars).length,
        missingVars: envStatus.details.details.missingVars,
        invalidVars: envStatus.details.details.invalidVars
      }
    })

    // Test 2: Supabase Connection
    console.log('Health Check: Testing Supabase connection')
    try {
      const supabase = createClient<Database>(
        config.supabase.url,
        config.supabase.serviceRoleKey
      )

      // Test basic connection
      const { data, error } = await supabase.from('documents').select('id').limit(1)
      
      results.push({
        service: 'supabase_database',
        status: error ? 'unhealthy' : 'healthy',
        message: error ? `Database error: ${error.message}` : 'Database connection successful',
        timestamp,
        details: {
          hasData: !!data,
          errorCode: error?.code,
          errorDetails: error?.details
        }
      })
    } catch (error) {
      results.push({
        service: 'supabase_database',
        status: 'unhealthy',
        message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp,
        details: { error: error instanceof Error ? error.stack : error }
      })
    }

    // Test 3: Supabase Storage
    console.log('Health Check: Testing Supabase storage')
    try {
      const supabase = createClient<Database>(
        config.supabase.url,
        config.supabase.serviceRoleKey
      )

      // Test storage bucket access
      const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets()
      const documentsExists = buckets?.some(bucket => bucket.name === 'documents')
      
      results.push({
        service: 'supabase_storage',
        status: bucketsError || !documentsExists ? 'unhealthy' : 'healthy',
        message: bucketsError 
          ? `Storage error: ${bucketsError.message}` 
          : documentsExists 
            ? 'Documents bucket accessible' 
            : 'Documents bucket not found',
        timestamp,
        details: {
          bucketsError,
          bucketsFound: buckets?.length || 0,
          documentsExists,
          bucketNames: buckets?.map(b => b.name) || []
        }
      })
    } catch (error) {
      results.push({
        service: 'supabase_storage',
        status: 'unhealthy',
        message: `Storage test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp,
        details: { error: error instanceof Error ? error.stack : error }
      })
    }

    // Test 4: User Authentication
    console.log('Health Check: Testing user authentication')
    results.push({
      service: 'user_auth',
      status: 'healthy',
      message: 'User authentication successful',
      timestamp,
      details: {
        userId: req.user.id,
        userEmail: req.user.email
      }
    })

    // Test 5: API Routes Availability
    console.log('Health Check: Testing API routes')
    const apiRoutes = [
      '/api/process-document'
    ]

    const routeResults = await Promise.allSettled(
      apiRoutes.map(async (route) => {
        try {
          // Test if the API handler exists by making an OPTIONS request
          const response = await fetch(`${req.headers.origin || 'http://localhost:3000'}${route}`, {
            method: 'OPTIONS',
            headers: {
              'Authorization': `Bearer ${req.headers.authorization?.split(' ')[1]}`
            }
          })
          return {
            route,
            status: response.status,
            exists: response.status !== 404
          }
        } catch (error) {
          return {
            route,
            status: null as number | null,
            exists: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      })
    )

    const routeDetails = routeResults.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value
      }
      return {
        route: apiRoutes[index],
        status: null as number | null,
        exists: false,
        error: result.reason
      }
    })

    const unhealthyRoutes = routeDetails.filter(r => !r.exists)

    results.push({
      service: 'api_routes',
      status: unhealthyRoutes.length === 0 ? 'healthy' : 'unhealthy',
      message: unhealthyRoutes.length === 0 
        ? 'All API routes accessible' 
        : `Inaccessible routes: ${unhealthyRoutes.map(r => r.route).join(', ')}`,
      timestamp,
      details: {
        routeTests: routeDetails,
        totalRoutes: apiRoutes.length,
        healthyRoutes: routeDetails.filter(r => r.exists).length
      }
    })

    // Overall health status
    const allHealthy = results.every(r => r.status === 'healthy')
    const overallStatus = allHealthy ? 'healthy' : 'unhealthy'

    console.log('Health Check: Completed', { overallStatus, results: results.length })

    return res.status(allHealthy ? 200 : 500).json({
      status: overallStatus,
      timestamp,
      services: results,
      summary: {
        total: results.length,
        healthy: results.filter(r => r.status === 'healthy').length,
        unhealthy: results.filter(r => r.status === 'unhealthy').length
      }
    })

  } catch (error) {
    console.error('Health Check: Fatal error', error)
    
    return res.status(500).json({
      status: 'unhealthy',
      timestamp,
      error: error instanceof Error ? error.message : 'Unknown error',
      services: results,
      summary: {
        total: results.length,
        healthy: results.filter(r => r.status === 'healthy').length,
        unhealthy: results.filter(r => r.status === 'unhealthy').length
      }
    })
  }
}

export default withAuth(healthCheckHandler)