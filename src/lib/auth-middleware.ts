import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { User } from '@supabase/supabase-js'

export interface AuthenticatedRequest extends NextApiRequest {
  user: User
}

export interface ApiError {
  error: string
  code?: string
  details?: string
}

export function apiError(res: NextApiResponse, statusCode: number, message: string, code?: string, details?: string): void {
  const errorResponse: ApiError = {
    error: message,
    ...(code && { code }),
    ...(details && { details })
  }
  res.status(statusCode).json(errorResponse)
}

export async function withAuth(
  req: NextApiRequest,
  res: NextApiResponse,
  handler: (req: AuthenticatedRequest, res: NextApiResponse) => Promise<void> | void
) {
  // Check for authorization header
  const authHeader = req.headers.authorization
  if (!authHeader) {
    return apiError(res, 401, 'No authorization header', 'MISSING_AUTH_HEADER')
  }

  // Extract token
  const token = authHeader.replace('Bearer ', '')
  if (!token) {
    return apiError(res, 401, 'Invalid authorization header format', 'INVALID_AUTH_FORMAT')
  }

  // Validate environment variables
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing required Supabase environment variables")
  }

  // Verify token with Supabase
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token)
    
    if (error || !user) {
      return apiError(res, 401, 'Invalid or expired token', 'INVALID_TOKEN', error?.message)
    }

    // Add user to request object
    const authenticatedReq = req as AuthenticatedRequest
    authenticatedReq.user = user

    // Call the actual handler
    return await handler(authenticatedReq, res)
  } catch (error) {
    console.error('Auth middleware error:', error)
    return apiError(res, 500, 'Authentication verification failed', 'AUTH_VERIFICATION_ERROR', 
      error instanceof Error ? error.message : 'Unknown error')
  }
}

// Rate limiting with token bucket
interface RateLimitBucket {
  tokens: number
  lastRefill: number
}

const rateLimitBuckets = new Map<string, RateLimitBucket>()

export function withRateLimit(
  identifier: string,
  maxTokens: number = 10,
  refillRate: number = 1, // tokens per minute
  handler: () => Promise<void> | void
) {
  const now = Date.now()
  const bucket = rateLimitBuckets.get(identifier) || { tokens: maxTokens, lastRefill: now }
  
  // Refill tokens based on time elapsed
  const timeSinceLastRefill = now - bucket.lastRefill
  const tokensToAdd = Math.floor(timeSinceLastRefill / (60000 / refillRate)) // 60000ms = 1 minute
  
  if (tokensToAdd > 0) {
    bucket.tokens = Math.min(maxTokens, bucket.tokens + tokensToAdd)
    bucket.lastRefill = now
  }
  
  // Check if request can proceed
  if (bucket.tokens < 1) {
    throw new Error('Rate limit exceeded')
  }
  
  // Consume token and update bucket
  bucket.tokens -= 1
  rateLimitBuckets.set(identifier, bucket)
  
  return handler()
}