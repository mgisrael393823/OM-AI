import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { User } from '@supabase/supabase-js'
import { ERROR_CODES, createApiError } from '@/lib/constants/errors'

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

function parseCookieHeader(header?: string) {
  const out: Record<string,string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (!k) continue
    out[k] = decodeURIComponent(rest.join('=') ?? '')
  }
  return out
}

export async function withAuth(
  req: NextApiRequest,
  res: NextApiResponse,
  handler: (req: AuthenticatedRequest, res: NextApiResponse) => Promise<void> | void
) {
  // Parse cookies from header if req.cookies is undefined
  const headerCookies = parseCookieHeader(req.headers?.cookie)
  const cookieMap = (req as any).cookies ?? headerCookies

  const sbAccessToken =
    cookieMap['sb-access-token'] ||
    cookieMap['supabase-access-token'] ||
    cookieMap['sb.access-token']

  let bearer: string | null = null
  const authHeader = (req.headers?.authorization || req.headers?.Authorization) as string | undefined
  if (authHeader?.startsWith('Bearer ')) bearer = authHeader.slice(7)

  let token = bearer || sbAccessToken
  
  if (!token) {
    if (process.env.ALLOW_DEV_NOAUTH === 'true') {
      ;(req as any).user = { id: process.env.DEV_FALLBACK_USER_ID || '22835c1c-fd8b-4939-a9ed-adb6e98bfc2b' }
      ;(req as any).userId = (req as any).user.id
      return handler(req as AuthenticatedRequest, res)
    } else {
      return createApiError(res, ERROR_CODES.MISSING_TOKEN)
    }
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
      return createApiError(res, ERROR_CODES.INVALID_TOKEN, error?.message)
    }

    // Add user to request object
    const authenticatedReq = req as AuthenticatedRequest
    authenticatedReq.user = user

    // Call the actual handler
    return await handler(authenticatedReq, res)
  } catch (error) {
    console.error('Auth middleware error:', error)
    return createApiError(res, ERROR_CODES.INTERNAL_ERROR, 
      error instanceof Error ? error.message : 'Authentication verification failed')
  }
}

// ---- REPLACE ONLY the withRateLimit implementation ----
type ApiHandler = (req: NextApiRequest, res: NextApiResponse) => any;

const RATE_LIMIT_TOKENS = 10;            // adjust as needed
const RATE_LIMIT_WINDOW_MS = 60_000;     // 1 minute
const rateLimitBuckets = new Map<string, { tokens: number; resetAt: number }>();

export function withRateLimit(handler: ApiHandler): ApiHandler {
  return async function rateLimited(req, res) {
    try {
      const now = Date.now();
      const userId = (req as any)?.user?.id as string | undefined;
      const ip =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        'unknown';

      const key = userId || `ip:${ip}`;
      let bucket = rateLimitBuckets.get(key);

      if (!bucket || now > bucket.resetAt) {
        bucket = { tokens: RATE_LIMIT_TOKENS, resetAt: now + RATE_LIMIT_WINDOW_MS };
        rateLimitBuckets.set(key, bucket);
      }

      if (bucket.tokens <= 0) {
        const retryAfter = Math.max(0, Math.ceil((bucket.resetAt - now) / 1000));
        res.setHeader('Retry-After', String(retryAfter));
        return res.status(429).json({ error: 'Rate limit exceeded', retryAfter });
      }

      bucket.tokens -= 1;
      return handler(req, res);
    } catch (e) {
      console.error('[withRateLimit] wrapper error', e);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  };
}
// ---- END REPLACEMENT ----