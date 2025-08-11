import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { withAuth, AuthenticatedRequest, apiError } from '@/lib/auth-middleware'
import { getConfig } from '@/lib/config'
import type { Database } from '@/types/database'

/**
 * Get document processing status
 * Used for polling to update UI when background processing completes
 */
async function statusHandler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return apiError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED')
  }

  const { id } = req.query
  if (!id || typeof id !== 'string') {
    return apiError(res, 400, 'Document ID is required', 'MISSING_DOCUMENT_ID')
  }

  const config = getConfig()
  const supabase = createClient<Database>(
    config.supabase.url,
    config.supabase.serviceRoleKey
  )

  try {
    // Get document with user verification
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id) // Ensure user owns this document
      .single()

    if (docError || !document) {
      return apiError(res, 404, 'Document not found', 'DOCUMENT_NOT_FOUND')
    }

    // Get processing job status if document is still processing
    let jobStatus = null
    if (document.status === 'processing') {
      const { data: job } = await supabase
        .from('processing_jobs')
        .select('*')
        .eq('document_id', id)
        .eq('job_type', 'pdf_processing')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (job) {
        jobStatus = {
          status: job.status,
          attempts: job.attempts,
          maxAttempts: job.max_attempts,
          createdAt: job.created_at,
          startedAt: job.started_at,
          completedAt: job.completed_at,
          errorMessage: job.error_message
        }
      }
    }

    // Get chunk count if processing is complete
    let chunkCount = 0
    let tableCount = 0
    if (document.status === 'completed') {
      const { count: chunks } = await supabase
        .from('document_chunks')
        .select('*', { count: 'exact', head: true })
        .eq('document_id', id)

      const { count: tables } = await supabase
        .from('document_tables')
        .select('*', { count: 'exact', head: true })
        .eq('document_id', id)

      chunkCount = chunks || 0
      tableCount = tables || 0
    }

    return res.status(200).json({
      success: true,
      document: {
        id: document.id,
        name: document.original_filename,
        status: document.status,
        fileSize: document.file_size,
        uploadedAt: document.created_at,
        processedAt: document.processed_at,
        extractedText: document.extracted_text ? document.extracted_text.slice(0, 200) + '...' : null,
        metadata: document.metadata
      },
      processing: {
        job: jobStatus,
        chunks: chunkCount,
        tables: tableCount
      }
    })

  } catch (error) {
    console.error('Document status error:', error)
    return apiError(res, 500, 'Failed to get document status', 'STATUS_ERROR',
      error instanceof Error ? error.message : 'Unknown error')
  }
}

export default withAuth(statusHandler)