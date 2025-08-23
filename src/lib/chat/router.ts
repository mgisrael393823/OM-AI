import type { NextApiRequest, NextApiResponse } from 'next'

export default async function chatRouter(req: NextApiRequest, res: NextApiResponse) {
  const requestId = (req.headers['x-request-id'] as string) || ''
  res.status(501).json({ error: 'CHAT_ROUTER_V2_NOT_IMPLEMENTED', requestId })
}
