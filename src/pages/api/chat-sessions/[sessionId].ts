import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { sessionId } = req.query

  if (typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'Invalid session ID' })
  }

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
      return res.status(404).json({ error: 'Session not found' })
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
      return res.status(500).json({ error: error.message })
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
      return res.status(500).json({ error: error.message })
    }

    return res.status(200).json({ success: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}