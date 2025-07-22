import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { chat_session_id, role, content, metadata = {} } = req.body

  // Get auth user
  const authHeader = req.headers.authorization
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header' })
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' })
  }

  // Verify the chat session belongs to the user
  const { data: session, error: sessionError } = await supabase
    .from('chat_sessions')
    .select('id')
    .eq('id', chat_session_id)
    .eq('user_id', user.id)
    .single()

  if (sessionError) {
    return res.status(404).json({ error: 'Chat session not found' })
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
    return res.status(500).json({ error: error.message })
  }

  // Update the session's updated_at timestamp
  await supabase
    .from('chat_sessions')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', chat_session_id)

  return res.status(201).json({ message })
}