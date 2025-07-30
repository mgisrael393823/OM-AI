import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { createApiError, ERROR_CODES } from '@/lib/constants/errors'
import { Database } from '@/types/database'

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { sessionId } = req.query

  if (typeof sessionId !== 'string') {
    return createApiError(res, ERROR_CODES.VALIDATION_ERROR, 'Invalid session ID')
  }

  // Get auth user
  const authHeader = req.headers.authorization
  if (!authHeader) {
    return createApiError(res, ERROR_CODES.MISSING_TOKEN)
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user) {
    return createApiError(res, ERROR_CODES.INVALID_TOKEN)
  }

  if (req.method === 'GET') {
    // Get specific chat session with messages
    const { data: session, error } = await supabase
      .from('chat_sessions')
      .select(`
        *,
        messages (
          id,
          role,
          content,
          metadata,
          created_at
        )
      `)
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()

    if (error) {
      return createApiError(res, ERROR_CODES.SESSION_NOT_FOUND)
    }

    return res.status(200).json({ session })
  }

  if (req.method === 'PUT') {
    // Update chat session (e.g., change title)
    const { title } = req.body

    const { data: session, error } = await supabase
      .from('chat_sessions')
      .update({ title })
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      return createApiError(res, ERROR_CODES.DATABASE_ERROR, error.message)
    }

    return res.status(200).json({ session })
  }

  if (req.method === 'DELETE') {
    // Delete chat session (this will also delete messages due to cascade)
    const { error } = await supabase
      .from('chat_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', user.id)

    if (error) {
      return createApiError(res, ERROR_CODES.DATABASE_ERROR, error.message)
    }

    return res.status(200).json({ success: true })
  }

  return createApiError(res, ERROR_CODES.METHOD_NOT_ALLOWED)
}