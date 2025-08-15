import type { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { withAuth, type AuthenticatedRequest } from '@/lib/auth-middleware'
import { simpleRateLimit } from '@/lib/rate-limiter'
import { z } from 'zod'

// Force Node.js runtime for service role operations
export const runtime = 'nodejs'

// Enable body parsing for JSON input
export const config = {
  api: {
    bodyParser: true
  }
}

// Input validation schema with path sanitization
const VerifyRequestSchema = z.object({
  path: z.string()
    .min(1, 'Path cannot be empty')
    .max(1000, 'Path too long')
    .refine(
      (path) => {
        // Reject dangerous patterns
        if (path.includes('..')) return false
        if (path.startsWith('/')) return false
        if (path.includes('//')) return false
        
        // Only allow safe characters: letters, numbers, slashes, hyphens, underscores, dots
        const safePattern = /^[A-Za-z0-9/_\-.]+$/
        return safePattern.test(path)
      },
      'Path contains invalid characters or patterns'
    ),
  expectedBytes: z.number()
    .int('Expected bytes must be an integer')
    .min(1, 'Expected bytes must be greater than 0')
    .max(100 * 1024 * 1024, 'Expected bytes cannot exceed 100MB') // Reasonable upper bound
})

// Response type definitions
interface VerifySuccessResponse {
  success: true
  exists: true
  bytes: number
  attempts: number
  verifiedAt: string
  totalTimeMs: number
}

interface VerifyNotFoundResponse {
  success: false
  exists: false
  code: 'FILE_NOT_FOUND'
  attempts: number
  totalTimeMs: number
}

interface VerifySizeMismatchResponse {
  success: false
  exists: true
  code: 'SIZE_MISMATCH'
  expectedBytes: number
  actualBytes: number
  attempts: number
  totalTimeMs: number
}

interface VerifyErrorResponse {
  success: false
  code: string
  details?: string | string[]
}

interface VerifyRateLimitResponse {
  success: false
  code: 'RATE_LIMITED'
  message: string
  limit: number
  remaining: number
  resetTime: number
}

type VerifyResponse = VerifySuccessResponse | VerifyNotFoundResponse | VerifySizeMismatchResponse | VerifyErrorResponse | VerifyRateLimitResponse

// Retry configuration with exponential backoff
const RETRY_DELAYS = [100, 250, 500, 1000, 1500, 3000, 4000] // 7 attempts, ~10s total
const MAX_TOTAL_TIME_MS = 10000 // 10 second hard timeout

async function verifyFileHandler(
  req: AuthenticatedRequest, 
  res: NextApiResponse<VerifyResponse>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({
      success: false,
      code: 'METHOD_NOT_ALLOWED'
    })
  }

  const startTime = Date.now()
  let attempts = 0

  try {
    // Rate limiting: 30 requests per minute per user
    const identity = (req as any).user?.id ?? 
      ((req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()) ?? 
      req.socket.remoteAddress ?? 'anon';
    const rateLimitKey = `/api/storage/verify:${identity}`;
    const rateLimitResult = simpleRateLimit(rateLimitKey, 30, 60000); // 30 requests per minute

    if (!rateLimitResult.allowed) {
      console.warn('Storage verification rate limited', {
        userId: req.user.id,
        limit: 30,
        remaining: rateLimitResult.remaining,
        resetTime: rateLimitResult.resetTime
      })
      
      return res.status(429).json({
        success: false,
        code: 'RATE_LIMITED',
        message: `Too many verification requests. Try again in ${Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)} seconds.`,
        limit: 30,
        remaining: rateLimitResult.remaining,
        resetTime: rateLimitResult.resetTime
      })
    }

    // Validate input with Zod schema
    const parseResult = VerifyRequestSchema.safeParse(req.body)
    
    if (!parseResult.success) {
      const details = parseResult.error.errors.map(err => `${err.path.join('.')}: ${err.message}`)
      return res.status(422).json({
        success: false,
        code: 'INVALID_INPUT',
        details
      })
    }

    const { path, expectedBytes } = parseResult.data

    // Resolve bucket server-side from environment (never trust client)
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'documents'
    
    // Create admin client with service role key (server-side only)
    let admin
    try {
      admin = getSupabaseAdmin()
    } catch (error) {
      console.error('Storage verification: Failed to create admin client:', error)
      return res.status(500).json({
        success: false,
        code: 'SUPABASE_ADMIN_MISCONFIG'
      })
    }

    console.log('Storage verification starting', {
      userId: req.user.id,
      path,
      bucket,
      expectedBytes,
      timestamp: new Date().toISOString()
    })

    // Sentry breadcrumb for monitoring
    if (typeof window === 'undefined' && (global as any).Sentry) {
      (global as any).Sentry.addBreadcrumb({
        category: 'storage.verification',
        message: 'Starting file verification',
        level: 'info',
        data: { path, expectedBytes, bucket, userId: req.user.id }
      })
    }

    // Bounded retry with exponential backoff
    let fileExists = false
    let actualBytes = 0

    for (let i = 0; i < RETRY_DELAYS.length; i++) {
      attempts++
      const elapsed = Date.now() - startTime

      // Hard timeout check
      if (elapsed >= MAX_TOTAL_TIME_MS) {
        console.warn('Storage verification timed out', {
          path,
          attempts,
          elapsedMs: elapsed,
          maxTimeMs: MAX_TOTAL_TIME_MS
        })
        break
      }

      // Wait before retry (except first attempt)
      if (i > 0) {
        const delay = RETRY_DELAYS[i - 1]
        console.log(`Storage verification retry ${attempts}/${RETRY_DELAYS.length}`, {
          path,
          delayMs: delay,
          elapsedMs: elapsed
        })
        await new Promise(resolve => setTimeout(resolve, delay))
      }

      try {
        // Create signed URL for direct file access
        const { data: signedUrlData, error: signedUrlError } = await admin.storage
          .from(bucket)
          .createSignedUrl(path, 60) // 60 second expiry

        if (signedUrlError) {
          console.error(`Storage verification attempt ${attempts} - signed URL error`, {
            path,
            error: signedUrlError.message
          })

          // Sentry breadcrumb for signed URL errors
          if (typeof window === 'undefined' && (global as any).Sentry) {
            (global as any).Sentry.addBreadcrumb({
              category: 'storage.verification',
              message: 'Signed URL creation failed',
              level: 'error',
              data: { path, attempt: attempts, error: signedUrlError.message }
            })
          }
          continue
        }

        if (!signedUrlData?.signedUrl) {
          console.error(`Storage verification attempt ${attempts} - no signed URL returned`, { path })
          continue
        }

        // Try HEAD request first (most efficient)
        try {
          const headResponse = await fetch(signedUrlData.signedUrl, { 
            method: 'HEAD',
            headers: {
              'User-Agent': 'OM-AI-Storage-Verification/1.0'
            }
          })

          if (headResponse.ok) {
            const contentLength = headResponse.headers.get('content-length')
            if (contentLength) {
              actualBytes = parseInt(contentLength, 10)
              fileExists = true

              console.log('Storage verification successful via HEAD', {
                path,
                attempts,
                actualBytes,
                expectedBytes,
                statusCode: headResponse.status
              })

              // Sentry breadcrumb for successful verification
              if (typeof window === 'undefined' && (global as any).Sentry) {
                (global as any).Sentry.addBreadcrumb({
                  category: 'storage.verification',
                  message: 'File verified successfully',
                  level: 'info',
                  data: { path, attempts, actualBytes, expectedBytes, method: 'HEAD' }
                })
              }
              break
            }
          }
        } catch (headError) {
          console.log(`Storage verification attempt ${attempts} - HEAD failed, trying Range GET`, {
            path,
            headError: headError instanceof Error ? headError.message : 'Unknown error'
          })
        }

        // Fallback to Range GET if HEAD is blocked
        try {
          const rangeResponse = await fetch(signedUrlData.signedUrl, {
            method: 'GET',
            headers: {
              'Range': 'bytes=0-0',
              'User-Agent': 'OM-AI-Storage-Verification/1.0'
            }
          })

          if (rangeResponse.status === 206 || rangeResponse.status === 200) {
            // Parse Content-Range header for total size
            const contentRange = rangeResponse.headers.get('content-range')
            if (contentRange) {
              // Format: "bytes 0-0/12345" where 12345 is total size
              const match = contentRange.match(/bytes \d+-\d+\/(\d+)/)
              if (match) {
                actualBytes = parseInt(match[1], 10)
                fileExists = true

                console.log('Storage verification successful via Range GET', {
                  path,
                  attempts,
                  actualBytes,
                  expectedBytes,
                  statusCode: rangeResponse.status,
                  contentRange
                })

                // Sentry breadcrumb for Range GET success
                if (typeof window === 'undefined' && (global as any).Sentry) {
                  (global as any).Sentry.addBreadcrumb({
                    category: 'storage.verification',
                    message: 'File verified via Range GET',
                    level: 'info',
                    data: { path, attempts, actualBytes, expectedBytes, method: 'RANGE_GET' }
                  })
                }
                break
              }
            }

            // Fallback: if no Content-Range, use Content-Length for 200 responses
            if (rangeResponse.status === 200) {
              const contentLength = rangeResponse.headers.get('content-length')
              if (contentLength) {
                actualBytes = parseInt(contentLength, 10)
                fileExists = true
                break
              }
            }
          }
        } catch (rangeError) {
          console.error(`Storage verification attempt ${attempts} - Range GET failed`, {
            path,
            rangeError: rangeError instanceof Error ? rangeError.message : 'Unknown error'
          })

          // Sentry breadcrumb for Range GET errors
          if (typeof window === 'undefined' && (global as any).Sentry) {
            (global as any).Sentry.addBreadcrumb({
              category: 'storage.verification',
              message: 'Range GET request failed',
              level: 'error',
              data: { path, attempt: attempts, error: rangeError instanceof Error ? rangeError.message : 'Unknown error' }
            })
          }
        }

      } catch (attemptError: any) {
        console.error(`Storage verification attempt ${attempts} failed`, {
          path,
          error: attemptError.message,
          stack: attemptError.stack
        })

        // Sentry breadcrumb for attempt failures
        if (typeof window === 'undefined' && (global as any).Sentry) {
          (global as any).Sentry.addBreadcrumb({
            category: 'storage.verification',
            message: 'Verification attempt failed',
            level: 'error',
            data: { path, attempt: attempts, error: attemptError.message }
          })
        }
      }
    }

    const totalTimeMs = Date.now() - startTime

    // File not found after all attempts
    if (!fileExists) {
      console.warn('Storage verification failed - file not found', {
        path,
        attempts,
        totalTimeMs,
        expectedBytes
      })

      return res.status(404).json({
        success: false,
        exists: false,
        code: 'FILE_NOT_FOUND',
        attempts,
        totalTimeMs
      })
    }

    // File exists but size mismatch
    if (actualBytes !== expectedBytes) {
      console.warn('Storage verification failed - size mismatch', {
        path,
        attempts,
        totalTimeMs,
        expectedBytes,
        actualBytes,
        sizeDiff: actualBytes - expectedBytes
      })

      return res.status(409).json({
        success: false,
        exists: true,
        code: 'SIZE_MISMATCH',
        expectedBytes,
        actualBytes,
        attempts,
        totalTimeMs
      })
    }

    // Success - file exists and size matches
    console.log('Storage verification successful', {
      path,
      attempts,
      totalTimeMs,
      bytes: actualBytes
    })

    return res.status(200).json({
      success: true,
      exists: true,
      bytes: actualBytes,
      attempts,
      verifiedAt: new Date().toISOString(),
      totalTimeMs
    })

  } catch (error: any) {
    const totalTimeMs = Date.now() - startTime
    console.error('Storage verification error', {
      error: error.message,
      stack: error.stack,
      attempts,
      totalTimeMs,
      userId: req.user.id
    })

    // Sentry breadcrumb for unexpected errors
    if (typeof window === 'undefined' && (global as any).Sentry) {
      (global as any).Sentry.addBreadcrumb({
        category: 'storage.verification',
        message: 'Unexpected verification error',
        level: 'error',
        data: { attempts, totalTimeMs, error: error.message }
      })
    }

    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR'
    })
  }
}

export default withAuth(verifyFileHandler)