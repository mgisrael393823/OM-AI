/**
 * Database-based rate limiting using Supabase
 */

import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'

// Use service role key for rate limiting operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface RateLimitConfig {
  endpoint: string
  maxRequests: number
  windowMinutes: number
}

export interface RateLimitResult {
  allowed: boolean
  reason?: string
  limit: number
  remaining: number
  resetTime: number
  windowMinutes: number
}

// Default rate limits for different endpoints
export const DEFAULT_RATE_LIMITS: Record<string, Omit<RateLimitConfig, 'endpoint'>> = {
  'chat': { maxRequests: 50, windowMinutes: 60 }, // 50 chat messages per hour
  'upload': { maxRequests: 10, windowMinutes: 60 }, // 10 uploads per hour
  'search': { maxRequests: 100, windowMinutes: 60 }, // 100 searches per hour
  'process': { maxRequests: 5, windowMinutes: 60 }, // 5 PDF processing requests per hour
  'api': { maxRequests: 200, windowMinutes: 60 }, // 200 general API calls per hour
}

/**
 * Check rate limit for a user and endpoint
 */
export async function checkRateLimit(
  userId: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  try {
    // Call the database function to check rate limit
    const { data, error } = await supabaseAdmin.rpc('check_rate_limit', {
      p_endpoint: config.endpoint,
      p_max_requests: config.maxRequests,
      p_window_minutes: config.windowMinutes
    })

    if (error) {
      console.error('Rate limit check error:', error)
      // Fail open - allow request if database error
      return {
        allowed: true,
        limit: config.maxRequests,
        remaining: config.maxRequests,
        resetTime: Date.now() + (config.windowMinutes * 60 * 1000),
        windowMinutes: config.windowMinutes
      }
    }

    return data as RateLimitResult
  } catch (error) {
    console.error('Rate limit check exception:', error)
    // Fail open - allow request if exception
    return {
      allowed: true,
      limit: config.maxRequests,
      remaining: config.maxRequests,
      resetTime: Date.now() + (config.windowMinutes * 60 * 1000),
      windowMinutes: config.windowMinutes
    }
  }
}

/**
 * Record API usage for monitoring (optional)
 */
export async function recordApiUsage(
  userId: string,
  endpoint: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    await supabaseAdmin.rpc('record_api_usage', {
      p_endpoint: endpoint,
      p_metadata: metadata || {}
    })
  } catch (error) {
    // Don't throw - usage recording is optional
    console.warn('Failed to record API usage:', error)
  }
}

/**
 * Middleware function to check rate limits
 */
export async function rateLimitMiddleware(
  request: NextRequest,
  endpoint: string,
  customConfig?: Partial<RateLimitConfig>
): Promise<{ allowed: boolean; response?: Response; rateLimitInfo: RateLimitResult }> {
  // Get user ID from request (you may need to adjust based on your auth implementation)
  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return {
      allowed: false,
      response: new Response(
        JSON.stringify({ error: 'Authentication required for rate limiting' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      ),
      rateLimitInfo: {
        allowed: false,
        reason: 'Authentication required',
        limit: 0,
        remaining: 0,
        resetTime: 0,
        windowMinutes: 0
      }
    }
  }

  // Extract user ID from token (you may need to implement token validation)
  // For now, we'll assume the user ID is in the token
  let userId: string
  try {
    // This is a simplified extraction - implement proper JWT validation
    const token = authHeader.replace('Bearer ', '')
    // You should validate the JWT and extract the user ID properly
    userId = 'user-id-from-token' // Placeholder
  } catch (error) {
    return {
      allowed: false,
      response: new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      ),
      rateLimitInfo: {
        allowed: false,
        reason: 'Invalid token',
        limit: 0,
        remaining: 0,
        resetTime: 0,
        windowMinutes: 0
      }
    }
  }

  // Get rate limit configuration
  const defaultConfig = DEFAULT_RATE_LIMITS[endpoint] || DEFAULT_RATE_LIMITS['api']
  const config: RateLimitConfig = {
    endpoint,
    ...defaultConfig,
    ...customConfig
  }

  // Check rate limit
  const rateLimitResult = await checkRateLimit(userId, config)

  if (!rateLimitResult.allowed) {
    const response = new Response(
      JSON.stringify({
        error: 'Rate limit exceeded',
        message: rateLimitResult.reason || 'Too many requests',
        rateLimitInfo: {
          limit: rateLimitResult.limit,
          remaining: rateLimitResult.remaining,
          resetTime: rateLimitResult.resetTime,
          windowMinutes: rateLimitResult.windowMinutes
        }
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': rateLimitResult.limit.toString(),
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
          'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
          'Retry-After': (rateLimitResult.windowMinutes * 60).toString()
        }
      }
    )

    return {
      allowed: false,
      response,
      rateLimitInfo: rateLimitResult
    }
  }

  return {
    allowed: true,
    rateLimitInfo: rateLimitResult
  }
}

/**
 * Simple in-memory rate limiter fallback (for development/testing)
 */
const memoryRateLimits = new Map<string, { count: number; resetTime: number }>()

export function simpleRateLimit(
  identifier: string,
  maxRequests: number = 100,
  windowMs: number = 60 * 60 * 1000 // 1 hour
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now()
  const key = `${identifier}`
  const existing = memoryRateLimits.get(key)

  if (!existing || existing.resetTime < now) {
    // First request or window expired
    const resetTime = now + windowMs
    memoryRateLimits.set(key, { count: 1, resetTime })
    return { allowed: true, remaining: maxRequests - 1, resetTime }
  }

  if (existing.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetTime: existing.resetTime }
  }

  existing.count++
  memoryRateLimits.set(key, existing)
  return { allowed: true, remaining: maxRequests - existing.count, resetTime: existing.resetTime }
}

/**
 * Cleanup old memory rate limit entries
 */
export function cleanupMemoryRateLimits() {
  const now = Date.now()
  for (const [key, value] of memoryRateLimits.entries()) {
    if (value.resetTime < now) {
      memoryRateLimits.delete(key)
    }
  }
}

// Cleanup memory rate limits every 10 minutes
if (typeof window === 'undefined') {
  setInterval(cleanupMemoryRateLimits, 10 * 60 * 1000)
}