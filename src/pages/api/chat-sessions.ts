import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'
import { withAuth, AuthenticatedRequest, apiError } from '@/lib/auth-middleware'

// Dev-only rate limiting for logging (not blocking)
const devRequestLog = new Map<string, number>()
const DEV_LOG_WINDOW = 1000 // 1 second

// In-flight request coalescing to prevent duplicate DB queries
const inFlightRequests = new Map<string, Promise<any>>()

function shouldLogRequest(userId: string): boolean {
  if (process.env.NODE_ENV !== 'development') return true
  
  const now = Date.now()
  const lastLog = devRequestLog.get(userId)
  
  if (!lastLog || (now - lastLog) > DEV_LOG_WINDOW) {
    devRequestLog.set(userId, now)
    return true
  }
  
  return false
}

// Generate request key for coalescing
function getRequestKey(method: string, userId: string): string {
  return `${method}:${userId}`
}

async function chatSessionsHandler(req: AuthenticatedRequest, res: NextApiResponse) {
  // Rate-limited logging for development
  if (shouldLogRequest(req.user.id)) {
    console.log('Chat Sessions API: Starting request', {
      method: req.method,
      userId: req.user.id,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString()
    })
  }

  // Validate environment variables
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Chat Sessions API: Missing Supabase environment variables', {
      hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
    })
    return apiError(res, 500, 'Server configuration error', 'MISSING_ENV_VARS')
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  if (req.method === 'GET') {
    const requestKey = getRequestKey('GET', req.user.id)
    
    console.log('Chat Sessions API: Fetching sessions for user:', req.user.id)

    // Check if there's already an in-flight request for this user
    const existingRequest = inFlightRequests.get(requestKey)
    if (existingRequest) {
      console.log('Chat Sessions API: Coalescing with existing request', {
        userId: req.user.id,
        requestKey
      })
      
      try {
        const result = await existingRequest
        return res.status(200).json(result)
      } catch (error) {
        // The original request failed, we'll fall through to make our own
        console.warn('Chat Sessions API: Coalesced request failed, making new request', {
          userId: req.user.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    // Create new database request
    const dbRequest = supabase
      .from('chat_sessions')
      .select(`
        *,
        messages (
          id,
          role,
          content,
          created_at
        )
      `)
      .eq('user_id', req.user.id)
      .order('updated_at', { ascending: false })
      .then(({ data: sessions, error }) => {
        if (error) {
          console.error('Chat Sessions API: Database query error', {
            error: error,
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            userId: req.user.id
          })
          throw new Error(error.message)
        }

        console.log('Chat Sessions API: Successfully fetched sessions', {
          count: sessions?.length || 0,
          userId: req.user.id
        })

        return { sessions }
      })

    // Store the promise for coalescing
    inFlightRequests.set(requestKey, dbRequest)

    try {
      const result = await dbRequest
      return res.status(200).json(result)
    } catch (dbError) {
      return apiError(res, 500, 'Failed to fetch chat sessions', 'DATABASE_ERROR', 
        dbError instanceof Error ? dbError.message : 'Unknown error')
    } finally {
      // Clean up the in-flight request
      inFlightRequests.delete(requestKey)
    }
  }

  if (req.method === 'POST') {
    console.log('Chat Sessions API: Creating new session for user:', req.user.id)

    try {
      const { title, document_id } = req.body

      const { data: session, error } = await supabase
        .from('chat_sessions')
        .insert({
          user_id: req.user.id,
          title: title || 'New Chat',
          document_id: document_id || null
        })
        .select()
        .single()

      if (error) {
        console.error('Chat Sessions API: Database insert error', {
          error: error,
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          userId: req.user.id,
          requestBody: { title, document_id }
        })
        return apiError(res, 500, 'Failed to create chat session', 'DATABASE_ERROR', error.message)
      }

      console.log('Chat Sessions API: Successfully created session', {
        sessionId: session.id,
        userId: req.user.id,
        title: session.title
      })

      return res.status(201).json({ session })
    } catch (catchError) {
      console.error('Chat Sessions API: Unexpected error in POST handler', {
        error: catchError,
        message: catchError instanceof Error ? catchError.message : 'Unknown error',
        stack: catchError instanceof Error ? catchError.stack : undefined,
        userId: req.user.id
      })
      return apiError(res, 500, 'Unexpected error creating chat session', 'UNEXPECTED_ERROR', 
        catchError instanceof Error ? catchError.message : 'Unknown error')
    }
  }

  return apiError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED')
}

export default withAuth(chatSessionsHandler)