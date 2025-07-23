import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { withAuth, AuthenticatedRequest, apiError } from '@/lib/auth-middleware'

async function documentsHandler(req: AuthenticatedRequest, res: NextApiResponse) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  if (req.method === 'GET') {
    const { page = '1', limit = '20', status, search } = req.query

    try {
      let queryBuilder = supabase
        .from('documents')
        .select('*')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false })

      // Apply filters
      if (status && typeof status === 'string') {
        queryBuilder = queryBuilder.eq('status', status)
      }

      if (search && typeof search === 'string') {
        queryBuilder = queryBuilder.ilike('name', `%${search}%`)
      }

      // Apply pagination
      const pageNum = Math.max(1, parseInt(page as string) || 1)
      const limitNum = Math.min(parseInt(limit as string) || 20, 100)
      const offset = (pageNum - 1) * limitNum

      queryBuilder = queryBuilder.range(offset, offset + limitNum - 1)

      const { data: documents, error: docsError } = await queryBuilder

      if (docsError) {
        console.error('Documents fetch error:', docsError)
        return apiError(res, 500, 'Failed to fetch documents', 'FETCH_ERROR', docsError.message)
      }

      // Get total count for pagination
      const { count, error: countError } = await supabase
        .from('documents')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', req.user.id)

      if (countError) {
        console.error('Count error:', countError)
      }

      const totalCount = count || 0
      const totalPages = Math.ceil(totalCount / limitNum)

      return res.status(200).json({
        success: true,
        documents: documents?.map(doc => ({
          id: doc.id,
          name: doc.name,
          size: doc.file_size,
          type: doc.file_type,
          status: doc.status,
          createdAt: doc.created_at,
          updatedAt: doc.updated_at,
          metadata: doc.metadata,
          // Include parsing summary
          summary: doc.metadata?.parsing ? {
            pages: doc.metadata.parsing.pages,
            tables: doc.metadata.parsing.tables,
            chunks: doc.metadata.parsing.chunks,
            processingTime: doc.metadata.parsing.processingTime,
            success: doc.metadata.parsing.success
          } : null,
          // Include validation summary
          validation: doc.metadata?.validation ? {
            isValid: doc.metadata.validation.isValid,
            hasText: doc.metadata.validation.metadata?.hasText,
            hasImages: doc.metadata.validation.metadata?.hasImages,
            isEncrypted: doc.metadata.validation.metadata?.isEncrypted,
            complexity: doc.metadata.validation.metadata?.estimatedComplexity,
            warnings: doc.metadata.validation.warnings?.length || 0
          } : null
        })) || [],
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalCount,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1
        }
      })

    } catch (error) {
      console.error('Documents handler error:', error)
      return apiError(res, 500, 'Failed to fetch documents', 'HANDLER_ERROR',
        error instanceof Error ? error.message : 'Unknown error')
    }

  } else if (req.method === 'DELETE') {
    // Bulk delete documents
    const { ids } = req.body

    if (!Array.isArray(ids) || ids.length === 0) {
      return apiError(res, 400, 'Document IDs are required', 'MISSING_IDS')
    }

    try {
      // Get documents to delete (verify ownership)
      const { data: documents, error: fetchError } = await supabase
        .from('documents')
        .select('id, file_path')
        .eq('user_id', req.user.id)
        .in('id', ids)

      if (fetchError) {
        return apiError(res, 500, 'Failed to fetch documents', 'FETCH_ERROR', fetchError.message)
      }

      if (!documents || documents.length === 0) {
        return apiError(res, 404, 'No documents found', 'NO_DOCUMENTS')
      }

      // Delete from storage
      const filePaths = documents.map(doc => doc.file_path).filter(Boolean)
      if (filePaths.length > 0) {
        const { error: storageError } = await supabase
          .storage
          .from('documents')
          .remove(filePaths)

        if (storageError) {
          console.error('Storage deletion error:', storageError)
          // Continue with database deletion even if storage fails
        }
      }

      // Delete related data (chunks and tables will cascade)
      const { error: deleteError } = await supabase
        .from('documents')
        .delete()
        .eq('user_id', req.user.id)
        .in('id', documents.map(doc => doc.id))

      if (deleteError) {
        return apiError(res, 500, 'Failed to delete documents', 'DELETE_ERROR', deleteError.message)
      }

      return res.status(200).json({
        success: true,
        deletedCount: documents.length,
        deletedIds: documents.map(doc => doc.id)
      })

    } catch (error) {
      console.error('Delete error:', error)
      return apiError(res, 500, 'Failed to delete documents', 'DELETE_ERROR',
        error instanceof Error ? error.message : 'Unknown error')
    }

  } else {
    return apiError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED')
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return withAuth(req, res, documentsHandler)
}