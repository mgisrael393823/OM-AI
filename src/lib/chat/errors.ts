import type { NextApiRequest, NextApiResponse } from 'next'

// Check if structured error format is requested
function shouldUseStructuredFormat(req: NextApiRequest): boolean {
  // Check header first
  const errorFormatHeader = req.headers['x-error-format'] as string
  if (errorFormatHeader === 'structured') {
    return true
  }
  
  // Check query parameter
  const errorFormatQuery = req.query.errorFormat as string
  if (errorFormatQuery === 'structured') {
    return true
  }
  
  return false
}

export function jsonError(
  res: NextApiResponse,
  status: number,
  code: string,
  message: string,
  requestId: string,
  req?: NextApiRequest
) {
  if (res.headersSent) return
  
  // Standard headers
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('X-Request-ID', requestId)
  
  // CORS headers - echo origin if available
  const origin = req?.headers.origin || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Request-ID, X-Correlation-ID, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Vary', 'Origin')
  
  // Method-specific headers
  if (status === 405) {
    res.setHeader('Allow', 'POST, OPTIONS')
  }
  
  // Default to legacy format for backward compatibility
  if (!req || !shouldUseStructuredFormat(req)) {
    // Legacy format
    return res.status(status).json({
      error: message,
      code,
      requestId
    })
  }
  
  // Structured format (opt-in only)
  return res.status(status).json({
    error: {
      type: 'api_error',
      code,
      message
    },
    requestId
  })
}