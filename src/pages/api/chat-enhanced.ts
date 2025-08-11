import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  console.warn('/api/chat-enhanced is deprecated. Use /api/chat instead')
  res.setHeader('X-Deprecated-Endpoint', 'chat-enhanced')
  res.status(410).json({ 
    error: 'Endpoint deprecated', 
    message: 'Please use /api/chat instead' 
  })
}
