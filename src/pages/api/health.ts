import { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Basic health checks
    const checks = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      services: {
        database: 'unknown',
        openai: 'unknown',
        storage: 'unknown'
      }
    }

    // Check Supabase connection
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      
      if (supabaseUrl && supabaseKey) {
        checks.services.database = 'configured'
      } else {
        checks.services.database = 'not_configured'
      }
    } catch (error) {
      checks.services.database = 'error'
    }

    // Check OpenAI configuration
    try {
      const openaiKey = process.env.OPENAI_API_KEY
      checks.services.openai = openaiKey ? 'configured' : 'not_configured'
    } catch (error) {
      checks.services.openai = 'error'
    }

    // Check Supabase Storage (same as database for now)
    checks.services.storage = checks.services.database

    // Determine overall status
    const allServicesHealthy = Object.values(checks.services).every(
      status => status === 'configured' || status === 'healthy'
    )
    
    checks.status = allServicesHealthy ? 'healthy' : 'degraded'

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