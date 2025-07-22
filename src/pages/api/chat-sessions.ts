import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    // Get all chat sessions for a user
    const authHeader = req.headers.authorization
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' })
    }

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
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    return res.status(200).json({ sessions })
  }

  if (req.method === 'POST') {
    // Create a new chat session
    const { title, document_id } = req.body
    const authHeader = req.headers.authorization
    
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    const { data: session, error } = await supabase
      .from('chat_sessions')
      .insert({
        user_id: user.id,
        title: title || 'New Chat',
        document_id: document_id || null
      })
      .select()
      .single()

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    return res.status(201).json({ session })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}