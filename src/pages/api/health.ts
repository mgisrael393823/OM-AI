import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Enhanced health checks for CI smoke testing
    const checks = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      version: process.env.NODE_ENV || 'development',
      services: {
        database: 'unknown',
        auth: 'unknown',
        storage: 'unknown',
        openai: 'unknown'
      },
      details: {}
    }

    // Check Supabase Database connection
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      
      if (supabaseUrl && supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey)
        
        // Test database connection with a simple query
        const { data, error } = await supabase
          .from('users')
          .select('count')
          .limit(1)
        
        if (error) {
          checks.services.database = 'error'
          checks.details.database = error.message
        } else {
          checks.services.database = 'healthy'
        }
      } else {
        checks.services.database = 'not_configured'
        checks.details.database = 'Missing environment variables'
      }
    } catch (error) {
      checks.services.database = 'error'
      checks.details.database = error instanceof Error ? error.message : 'Unknown error'
    }

    // Check Supabase Auth
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      
      if (supabaseUrl && supabaseAnonKey) {
        const supabase = createClient(supabaseUrl, supabaseAnonKey)
        
        // Test auth service (this should work even without a session)
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error && !error.message.includes('session_not_found')) {
          checks.services.auth = 'error'
          checks.details.auth = error.message
        } else {
          checks.services.auth = 'healthy'
        }
      } else {
        checks.services.auth = 'not_configured'
        checks.details.auth = 'Missing environment variables'
      }
    } catch (error) {
      checks.services.auth = 'error'
      checks.details.auth = error instanceof Error ? error.message : 'Unknown error'
    }

    // Check Supabase Storage
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      
      if (supabaseUrl && supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey)
        
        // Test storage by listing buckets
        const { data, error } = await supabase.storage.listBuckets()
        
        if (error) {
          checks.services.storage = 'error'
          checks.details.storage = error.message
        } else {
          const documentsBucket = data?.find(b => b.name === 'documents')
          if (documentsBucket) {
            checks.services.storage = 'healthy'
          } else {
            checks.services.storage = 'degraded'
            checks.details.storage = 'Documents bucket not found'
          }
        }
      } else {
        checks.services.storage = 'not_configured'
        checks.details.storage = 'Missing environment variables'
      }
    } catch (error) {
      checks.services.storage = 'error'
      checks.details.storage = error instanceof Error ? error.message : 'Unknown error'
    }

    // Check OpenAI configuration and connectivity
    try {
      const openaiKey = process.env.OPENAI_API_KEY
      
      if (openaiKey) {
        // Test OpenAI connectivity with a simple API call
        const OpenAI = await import('openai')
        const openai = new OpenAI.default({ apiKey: openaiKey })
        
        try {
          // Use a minimal request to test connectivity
          await openai.models.list()
          checks.services.openai = 'healthy'
        } catch (apiError) {
          checks.services.openai = 'error'
          checks.details.openai = apiError instanceof Error ? apiError.message : 'API call failed'
        }
      } else {
        checks.services.openai = 'not_configured'
        checks.details.openai = 'Missing OPENAI_API_KEY'
      }
    } catch (error) {
      checks.services.openai = 'error'
      checks.details.openai = error instanceof Error ? error.message : 'Unknown error'
    }

    // Determine overall status
    const healthyServices = Object.values(checks.services).filter(status => status === 'healthy').length
    const totalServices = Object.keys(checks.services).length
    const errorServices = Object.values(checks.services).filter(status => status === 'error').length
    
    if (errorServices > 0) {
      checks.status = 'unhealthy'
    } else if (healthyServices === totalServices) {
      checks.status = 'healthy'
    } else {
      checks.status = 'degraded'
    }

    // Add summary for CI
    checks.summary = {
      healthy: healthyServices,
      total: totalServices,
      errors: errorServices
    }

    const statusCode = checks.status === 'healthy' ? 200 : 503

    return res.status(statusCode).json(checks)
  } catch (error) {
    console.error('Health check error:', error)
    return res.status(500).json({
      timestamp: new Date().toISOString(),
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}