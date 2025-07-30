import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { withAuth, AuthenticatedRequest } from '@/lib/auth-middleware'
import { createApiError, ERROR_CODES } from '@/lib/constants/errors'
import { processUploadedDocument } from '@/lib/document-processor'
import { getConfig } from '@/lib/config'
import type { Database } from '@/types/database'

async function processDocumentHandler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return createApiError(res, ERROR_CODES.METHOD_NOT_ALLOWED)
  }

  try {
    const { fileName, originalFileName, fileSize, userId } = req.body

    // Validate required fields
    if (!fileName || !originalFileName || !fileSize || !userId) {
      return createApiError(res, ERROR_CODES.VALIDATION_ERROR, 'Missing required fields')
    }

    // Verify the userId matches the authenticated user
    if (userId !== req.user.id) {
      return createApiError(res, ERROR_CODES.FORBIDDEN, 'User ID mismatch')
    }

    console.log('Process Document API: Starting processing for:', originalFileName)

    // Initialize Supabase client
    const config = getConfig()
    const supabase = createClient<Database>(
      config.supabase.url,
      config.supabase.serviceRoleKey
    )

    // Download the file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from('documents')
      .download(fileName)

    if (downloadError) {
      console.error('Download error:', downloadError)
      return createApiError(res, ERROR_CODES.STORAGE_ERROR, `File not found: ${downloadError.message}`)
    }

    // Convert to buffer for processing
    const arrayBuffer = await fileData.arrayBuffer()
    const fileBuffer = Buffer.from(arrayBuffer)

    console.log('Process Document API: File downloaded, starting processing')

    // Process the document
    const processingResult = await processUploadedDocument(
      fileBuffer,
      fileName,
      originalFileName,
      fileName, // storagePath is the same as fileName
      fileSize,
      userId
    )

    if (!processingResult.success) {
      console.error('Processing failed:', processingResult.error)
      return createApiError(res, ERROR_CODES.INTERNAL_ERROR, processingResult.error)
    }

    console.log('Process Document API: Processing completed successfully')

    // Return success response
    res.status(200).json({
      success: true,
      document: processingResult.document
    })

  } catch (error) {
    console.error('Process document API error:', error)
    return createApiError(
      res,
      ERROR_CODES.INTERNAL_ERROR,
      error instanceof Error ? error.message : 'Unknown error'
    )
  }
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return withAuth(req, res, processDocumentHandler)
}