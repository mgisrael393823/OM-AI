import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { createApiError, ERROR_CODES } from '@/lib/constants/errors'
import { Database } from '@/types/database'

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return createApiError(res, ERROR_CODES.METHOD_NOT_ALLOWED)
  }

  const { chat_session_id, role, content, metadata = {} } = req.body

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

  // Verify the chat session belongs to the user
  const { data: session, error: sessionError } = await supabase
    .from('chat_sessions')
    .select('id')
    .eq('id', chat_session_id)
    .eq('user_id', user.id)
    .single()

  if (sessionError) {
    return createApiError(res, ERROR_CODES.SESSION_NOT_FOUND)
  }

  // Insert the message
  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      chat_session_id,
      role,
      content,
      metadata
    })
    .select()
    .single()

  if (error) {
    return createApiError(res, ERROR_CODES.DATABASE_ERROR, error.message)
  }

  // Update the session's updated_at timestamp
  await supabase
    .from('chat_sessions')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', chat_session_id)

  return res.status(201).json({ message })
}