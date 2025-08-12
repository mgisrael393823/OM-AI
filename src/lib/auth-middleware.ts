import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { User } from '@supabase/supabase-js'
import { ERROR_CODES, createApiError } from '@/lib/constants/errors'

export interface AuthenticatedRequest extends NextApiRequest {
  user: User
  userId: string
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

function parseCookieHeader(header?: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (!k) continue
    out[k] = decodeURIComponent(rest.join('=') ?? '')
  }
  return out
}

/**
 * Authentication middleware that returns a (req, res) => Promise<void> function
 * @param handler - The handler that requires authentication
 * @returns A function that handles the request
 */
export function withAuth(
  handler: (req: AuthenticatedRequest, res: NextApiResponse) => Promise<void> | void
): (req: NextApiRequest, res: NextApiResponse) => Promise<void> {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      // Parse cookies from header if req.cookies is undefined
      const headerCookies = parseCookieHeader(req.headers?.cookie)
      const cookieMap = (req as any).cookies ?? headerCookies

      const sbAccessToken =
        cookieMap['sb-access-token'] ||
        cookieMap['supabase-access-token'] ||
        cookieMap['sb.access-token']

      let bearer: string | null = null
      const authHeader = (req.headers?.authorization || (req.headers as any)?.Authorization) as string | undefined
      if (authHeader?.startsWith('Bearer ')) bearer = authHeader.slice(7)

      const token = bearer || sbAccessToken
      
      if (!token) {
        // Development mode bypass
        if (process.env.ALLOW_DEV_NOAUTH === 'true') {
          const devUserId = process.env.DEV_FALLBACK_USER_ID || '22835c1c-fd8b-4939-a9ed-adb6e98bfc2b'
          ;(req as AuthenticatedRequest).user = { id: devUserId } as User
          ;(req as AuthenticatedRequest).userId = devUserId
          return handler(req as AuthenticatedRequest, res)
        }
        return createApiError(res, ERROR_CODES.MISSING_TOKEN)
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

      const { data: { user }, error } = await supabase.auth.getUser(token)
      
      if (error || !user) {
        // Enhanced error message with debugging info
        const tokenSource = bearer ? 'Authorization header' : 'cookie'
        const tokenPreview = token?.substring(0, 20) + '...' + token?.substring(token.length - 4)
        
        console.error('🔒 Token validation failed:', {
          error: error?.message,
          tokenSource,
          tokenPreview,
          hasUser: !!user,
          timestamp: new Date().toISOString()
        })

        // Check if token looks like it might be expired based on error message
        const isExpiredToken = error?.message?.includes('expired') || 
                             error?.message?.includes('invalid_token') ||
                             error?.message?.includes('JWT')

        const errorDetails = isExpiredToken 
          ? 'Token appears to be expired. Please refresh your session and try again.'
          : error?.message || 'Token validation failed'

        return createApiError(
          res, 
          ERROR_CODES.INVALID_TOKEN, 
          `${errorDetails} (Source: ${tokenSource})`
        )
      }

      // Log successful token validation in development
      if (process.env.NODE_ENV === 'development') {
        const tokenSource = bearer ? 'Authorization header' : 'cookie'
        console.log('✅ Token validated successfully:', {
          userId: user.id,
          email: user.email,
          tokenSource,
          endpoint: `${req.method} ${req.url}`,
          timestamp: new Date().toISOString()
        })
      }

      // Add user to request object
      const authenticatedReq = req as AuthenticatedRequest
      authenticatedReq.user = user
      authenticatedReq.userId = user.id

      // Call the actual handler
      return await handler(authenticatedReq, res)
    } catch (error) {
      console.error('Auth middleware error:', error)
      return createApiError(res, ERROR_CODES.INTERNAL_ERROR, 
        error instanceof Error ? error.message : 'Authentication verification failed')
    }
  }
}

// Rate limiting with token bucket
interface RateLimitBucket {
  tokens: number
  resetAt: number
}

interface RateLimitOptions {
  id?: string
  tokens?: number
  windowMs?: number
}

const rateLimitBuckets = new Map<string, RateLimitBucket>()

/**
 * Rate limiting middleware using token bucket algorithm
 * @param options - Configuration for rate limiting
 * @returns A middleware function that wraps the handler
 */
export function withRateLimit(options: RateLimitOptions = {}) {
  const { 
    id = 'default',
    tokens = 10, 
    windowMs = 60000 // 1 minute
  } = options

  return function(handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void> | void) {
    return async function rateLimited(req: NextApiRequest, res: NextApiResponse) {
      try {
        const now = Date.now()
        const userId = (req as AuthenticatedRequest).userId || (req as any)?.user?.id
        const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
                   req.socket.remoteAddress ||
                   'unknown'

        const key = `${id}:${userId || `ip:${ip}`}`
        let bucket = rateLimitBuckets.get(key)

        if (!bucket || now > bucket.resetAt) {
          bucket = { tokens, resetAt: now + windowMs }
          rateLimitBuckets.set(key, bucket)
        }

        if (bucket.tokens <= 0) {
          const retryAfter = Math.max(0, Math.ceil((bucket.resetAt - now) / 1000))
          res.setHeader('Retry-After', String(retryAfter))
          return res.status(429).json({ 
            error: 'Rate limit exceeded', 
            retryAfter,
            code: 'RATE_LIMIT_EXCEEDED'
          })
        }

        bucket.tokens -= 1
        return handler(req, res)
      } catch (e) {
        console.error('[withRateLimit] wrapper error', e)
        return res.status(500).json({ error: 'Internal Server Error' })
      }
    }
  }
}

// Export for backward compatibility
export type ApiHandler = (req: NextApiRequest, res: NextApiResponse) => Promise<void> | void