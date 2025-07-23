import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { withAuth, AuthenticatedRequest, apiError } from '@/lib/auth-middleware'

async function documentsHandler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return apiError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED')
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // Fetch user's documents ordered by creation date (newest first)
    const { data: documents, error } = await supabase
      .from('documents')
      .select('id, filename, original_filename, file_size, file_type, status, created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Database error fetching documents:', error)
      return apiError(res, 500, 'Failed to fetch documents', 'DATABASE_ERROR', error.message)
    }

    // Transform documents to match UI expectations
    const transformedDocuments = documents.map(doc => ({
      id: doc.id,
      name: doc.original_filename,
      uploadedAt: doc.created_at,
      status: doc.status,
      size: Math.round((doc.file_size / 1024 / 1024) * 10) / 10 // Convert to MB and round to 1 decimal
    }))

    return res.status(200).json({
      success: true,
      documents: transformedDocuments
    })
  } catch (error) {
    console.error('Error fetching documents:', error)
    return apiError(res, 500, 'Failed to fetch documents', 'FETCH_ERROR',
      error instanceof Error ? error.message : 'Unknown error')
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return withAuth(req, res, documentsHandler)
}