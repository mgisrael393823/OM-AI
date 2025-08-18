import { NextApiRequest, NextApiResponse } from 'next'
import * as kvStore from '@/lib/kv-store'

interface HealthResponse {
  adapter: 'vercel-kv' | 'memory'
  kvAvailable: boolean
  environment?: string
}

/**
 * Health check endpoint for upload system
 * Returns the current storage adapter and KV availability
 */
export default function handler(req: NextApiRequest, res: NextApiResponse<HealthResponse>) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      adapter: 'memory',
      kvAvailable: false
    })
  }

  const healthData: HealthResponse = {
    adapter: kvStore.getAdapter(),
    kvAvailable: kvStore.isKvAvailable()
  }

  // Optionally include environment info in non-production
  if (process.env.NODE_ENV !== 'production') {
    healthData.environment = process.env.VERCEL_ENV || 'local'
  }

  return res.status(200).json(healthData)
}