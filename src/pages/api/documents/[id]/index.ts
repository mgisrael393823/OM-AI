import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { withAuth, AuthenticatedRequest, apiError } from '@/lib/auth-middleware'
import { getConfig } from '@/lib/config'
import type { Database } from '@/types/database'

/**
 * Handle document operations
 * DELETE /api/documents/[id] - Delete a document and all related data
 */
async function documentHandler(req: AuthenticatedRequest, res: NextApiResponse) {
  const { id } = req.query
  
  if (!id || typeof id !== 'string') {
    return apiError(res, 400, 'Document ID is required', 'MISSING_DOCUMENT_ID')
  }

  const config = getConfig()
  const supabase = createClient<Database>(
    config.supabase.url,
    config.supabase.serviceRoleKey
  )

  if (req.method === 'DELETE') {
    try {
      // First, get the document to verify ownership and get storage path
      const { data: document, error: docError } = await supabase
        .from('documents')
        .select('*')
        .eq('id', id)
        .eq('user_id', req.user.id) // Ensure user owns this document
        .single()

      if (docError || !document) {
        return apiError(res, 404, 'Document not found', 'DOCUMENT_NOT_FOUND')
      }

      // Delete related data in order (due to foreign key constraints)
      
      // 1. Delete document chunks
      const { error: chunksError } = await supabase
        .from('document_chunks')
        .delete()
        .eq('document_id', id)

      if (chunksError) {
        console.error('Error deleting document chunks:', chunksError)
        // Continue anyway - we want to clean up as much as possible
      }

      // 2. Delete document tables
      const { error: tablesError } = await supabase
        .from('document_tables')
        .delete()
        .eq('document_id', id)

      if (tablesError) {
        console.error('Error deleting document tables:', tablesError)
        // Continue anyway
      }

      // 3. Delete processing jobs (if the table exists)
      const { error: jobsError } = await supabase
        .from('processing_jobs')
        .delete()
        .eq('document_id', id)
        .select()

      if (jobsError && !jobsError.message.includes('relation "processing_jobs" does not exist')) {
        console.error('Error deleting processing jobs:', jobsError)
        // Continue anyway
      }

      // 4. Delete the file from storage
      if (document.storage_path) {
        const { error: storageError } = await supabase
          .storage
          .from('documents')
          .remove([document.storage_path])

        if (storageError) {
          console.error('Error deleting file from storage:', storageError)
          // Continue anyway - we still want to delete the database record
        }
      }

      // 5. Finally, delete the document record
      const { error: deleteError } = await supabase
        .from('documents')
        .delete()
        .eq('id', id)
        .eq('user_id', req.user.id) // Double-check ownership

      if (deleteError) {
        console.error('Error deleting document record:', deleteError)
        return apiError(res, 500, 'Failed to delete document', 'DELETE_ERROR', deleteError.message)
      }

      // Log the deletion for audit purposes
      await supabase.from('usage_logs').insert({
        user_id: req.user.id,
        action: 'document_delete',
        document_id: id,
        metadata: {
          document_name: document.original_filename,
          file_size: document.file_size,
          deleted_at: new Date().toISOString()
        }
      })

      return res.status(200).json({
        success: true,
        message: 'Document deleted successfully',
        documentId: id
      })

    } catch (error) {
      console.error('Document deletion error:', error)
      return apiError(res, 500, 'Failed to delete document', 'DELETE_ERROR',
        error instanceof Error ? error.message : 'Unknown error')
    }
  }

  // Handle other methods
  if (req.method === 'GET') {
    // Get document details
    try {
      const { data: document, error: docError } = await supabase
        .from('documents')
        .select('*')
        .eq('id', id)
        .eq('user_id', req.user.id)
        .single()

      if (docError || !document) {
        return apiError(res, 404, 'Document not found', 'DOCUMENT_NOT_FOUND')
      }

      return res.status(200).json({
        success: true,
        document
      })
    } catch (error) {
      console.error('Document fetch error:', error)
      return apiError(res, 500, 'Failed to fetch document', 'FETCH_ERROR',
        error instanceof Error ? error.message : 'Unknown error')
    }
  }

  return apiError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED')
}

export default withAuth(documentHandler)