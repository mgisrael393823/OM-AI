import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { withAuth, AuthenticatedRequest, apiError } from '@/lib/auth-middleware'
import { getConfig } from '@/lib/config'
import type { Database } from '@/types/database'

/**
 * Handle documents collection operations
 * GET /api/documents - List all documents for the authenticated user
 */
async function documentsHandler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return apiError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED')
  }

  const config = getConfig()
  const supabase = createClient<Database>(
    config.supabase.url,
    config.supabase.serviceRoleKey
  )

  try {
    // Get all documents for the user
    const { data: documents, error: docError } = await supabase
      .from('documents')
      .select(`
        id,
        filename,
        original_filename,
        file_size,
        file_type,
        status,
        created_at,
        processed_at,
        metadata
      `)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })

    if (docError) {
      console.error('Error fetching documents:', docError)
      return apiError(res, 500, 'Failed to fetch documents', 'FETCH_ERROR', docError.message)
    }

    // Format documents for the UI
    const formattedDocuments = (documents || []).map(doc => ({
      id: doc.id,
      name: doc.original_filename,
      filename: doc.filename,
      size: Math.round((doc.file_size || 0) / 1024 / 1024 * 100) / 100, // Size in MB with 2 decimals
      status: doc.status,
      uploadedAt: doc.created_at,
      processedAt: doc.processed_at,
      metadata: doc.metadata
    }))

    return res.status(200).json({
      success: true,
      documents: formattedDocuments,
      total: formattedDocuments.length
    })

  } catch (error) {
    console.error('Documents fetch error:', error)
    return apiError(res, 500, 'Failed to fetch documents', 'FETCH_ERROR',
      error instanceof Error ? error.message : 'Unknown error')
  }
}

export default withAuth(documentsHandler)