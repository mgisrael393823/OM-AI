import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'
import { withAuth, AuthenticatedRequest, apiError } from '@/lib/auth-middleware'

async function chatSessionsHandler(req: AuthenticatedRequest, res: NextApiResponse) {
  console.log('Chat Sessions API: Starting request', {
    method: req.method,
    userId: req.user.id,
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString()
  })

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
    console.log('Chat Sessions API: Fetching sessions for user:', req.user.id)

    try {
      const { data: sessions, error } = await supabase
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

      if (error) {
        console.error('Chat Sessions API: Database query error', {
          error: error,
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          userId: req.user.id
        })
        return apiError(res, 500, 'Failed to fetch chat sessions', 'DATABASE_ERROR', error.message)
      }

      console.log('Chat Sessions API: Successfully fetched sessions', {
        count: sessions?.length || 0,
        userId: req.user.id
      })

      return res.status(200).json({ sessions })
    } catch (catchError) {
      console.error('Chat Sessions API: Unexpected error in GET handler', {
        error: catchError,
        message: catchError instanceof Error ? catchError.message : 'Unknown error',
        stack: catchError instanceof Error ? catchError.stack : undefined,
        userId: req.user.id
      })
      return apiError(res, 500, 'Unexpected error fetching chat sessions', 'UNEXPECTED_ERROR', 
        catchError instanceof Error ? catchError.message : 'Unknown error')
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