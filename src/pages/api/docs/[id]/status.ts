import type { NextApiRequest, NextApiResponse } from 'next'
import { withAuth, type AuthenticatedRequest } from '@/lib/auth-middleware'
import * as kvStore from '@/lib/kv-store'
import { getDocumentReadinessSummary } from '@/lib/utils/document-readiness'
import { jsonError } from '@/lib/chat/errors'

/**
 * GET /api/docs/[id]/status
 * 
 * Returns live document processing status with readiness metrics
 * Always returns fresh data with no caching
 */
async function statusHandler(req: AuthenticatedRequest, res: NextApiResponse): Promise<void> {
  // CORS headers for cross-origin requests
  const origin = req.headers.origin || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Vary', 'Origin')
  
  // Prevent ALL caching - ensure fresh data
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
  res.setHeader('Surrogate-Control', 'no-store')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  
  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }
  
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS')
    return jsonError(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET and OPTIONS methods are allowed', 'status-req', req)
  }
  
  const { id } = req.query
  const documentId = Array.isArray(id) ? id[0] : id
  
  if (!documentId || !documentId.startsWith('mem-')) {
    return jsonError(res, 400, 'INVALID_DOCUMENT_ID', 'Invalid or missing document ID', 'status-req', req)
  }
  
  const userId = req.user?.id || 'anonymous'
  
  try {
    // Fetch live status - no caching
    const status = await kvStore.getStatus(documentId, userId)
    
    if (!status || status.status === 'missing') {
      return jsonError(res, 404, 'DOCUMENT_NOT_FOUND', 'Document not found or expired', 'status-req', req)
    }
    
    // Get comprehensive readiness summary
    const readiness = getDocumentReadinessSummary(
      status.status,
      status.parts || 0,
      status.pagesIndexed || 0
    )
    
    const response = {
      status: status.status,
      parts: status.parts || 0,
      requiredParts: readiness.requiredParts,
      pagesIndexed: status.pagesIndexed || 0,
      percentReady: readiness.percentReady,
      isReady: readiness.isReady,
      contentHash: status.contentHash || null,
      updatedAt: status.updatedAt || new Date().toISOString(),
      // Include timing estimates if processing
      ...(readiness.estimatedTimeSeconds && { 
        estimatedTimeSeconds: readiness.estimatedTimeSeconds 
      }),
      ...(readiness.retryAfterSeconds && { 
        retryAfterSeconds: readiness.retryAfterSeconds 
      }),
      // Include error if present
      ...(status.error && { error: status.error })
    }
    
    return res.status(200).json(response)
  } catch (error) {
    console.error('[status-endpoint] Error fetching document status:', error)
    return jsonError(res, 500, 'STATUS_ERROR', 'Failed to fetch document status', 'status-req', req)
  }
}

export default withAuth(statusHandler)