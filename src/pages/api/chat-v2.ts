import type { NextApiRequest, NextApiResponse } from 'next'
import { withAuth } from '@/lib/auth-middleware'
import { chatHandler } from './chat'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  console.warn('/api/chat-v2 is deprecated. Redirecting to /api/chat')
  res.setHeader('X-Deprecated-Endpoint', 'chat-v2')
  return withAuth(req, res, chatHandler)
}
