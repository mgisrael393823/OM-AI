import { NextApiRequest, NextApiResponse } from 'next'
import { withAuth, AuthenticatedRequest } from '@/lib/auth-middleware'
import * as kvStore from '@/lib/kv-store'
import { structuredLog, generateRequestId } from '@/lib/log'

// Force Node.js runtime for KV consistency
export const runtime = 'nodejs'

interface ContextStatusResponse {
  status: 'processing' | 'ready' | 'missing' | 'error'
  parts?: number
  pagesIndexed?: number
  error?: string
}

async function contextStatusHandler(
  req: AuthenticatedRequest,
  res: NextApiResponse<ContextStatusResponse | { error: string; code: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      code: 'METHOD_NOT_ALLOWED'
    })
  }

  const requestId = generateRequestId('status')
  const userId = req.user.id
  const documentId = req.query.documentId as string

  // Validate documentId
  if (!documentId) {
    structuredLog('warn', 'Missing documentId parameter', {
      documentId: 'none',
      userId,
      kvRead: false,
      status: 'invalid',
      request_id: requestId
    })
    
    return res.status(400).json({
      error: 'Missing documentId parameter',
      code: 'MISSING_DOCUMENT_ID'
    })
  }

  // Validate format
  if (!documentId.startsWith('mem-')) {
    structuredLog('warn', 'Invalid document ID format', {
      documentId,
      userId,
      kvRead: false,
      status: 'invalid',
      request_id: requestId
    })
    
    return res.status(400).json({
      error: 'Invalid document ID format',
      code: 'INVALID_DOCUMENT_ID'
    })
  }

  try {
    // Get status from KV
    const status = await kvStore.getStatus(documentId, userId)
    
    structuredLog('info', 'Context status retrieved', {
      documentId,
      userId,
      kvRead: true,
      status: status.status,
      parts: status.parts,
      request_id: requestId
    })
    
    // Return status response
    const response: ContextStatusResponse = {
      status: status.status,
      ...(status.parts && { parts: status.parts }),
      ...(status.pagesIndexed && { pagesIndexed: status.pagesIndexed }),
      ...(status.error && { error: status.error })
    }
    
    return res.status(200).json(response)
    
  } catch (error) {
    structuredLog('error', 'Failed to retrieve context status', {
      documentId,
      userId,
      kvRead: false,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      request_id: requestId
    })
    
    return res.status(500).json({
      error: 'Failed to retrieve context status',
      code: 'STATUS_RETRIEVAL_ERROR'
    })
  }
}

export default withAuth(contextStatusHandler)