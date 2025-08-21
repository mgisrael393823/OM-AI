import type { NextApiResponse } from 'next'

export function jsonError(
  res: NextApiResponse,
  status: number,
  code: string,
  message: string,
  requestId: string
) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  return res.status(status).json({
    error: {
      type: 'api_error',
      code,
      message,
      requestId
    }
  })
}
// TODO[Claude]: extend error helpers for richer diagnostics
