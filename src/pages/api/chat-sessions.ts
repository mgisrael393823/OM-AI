import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'
import { withAuth, AuthenticatedRequest, apiError } from '@/lib/auth-middleware'

async function chatSessionsHandler(req: AuthenticatedRequest, res: NextApiResponse) {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  if (req.method === 'GET') {
    // Get all chat sessions for a user

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
      return apiError(res, 500, 'Failed to fetch chat sessions', 'DATABASE_ERROR', error.message)
    }

    return res.status(200).json({ sessions })
  }

  if (req.method === 'POST') {
    // Create a new chat session
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
      return apiError(res, 500, 'Failed to create chat session', 'DATABASE_ERROR', error.message)
    }

    return res.status(201).json({ session })
  }

  return apiError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED')
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return withAuth(req, res, chatSessionsHandler)
}