import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { withAuth, apiError, AuthenticatedRequest } from '@/lib/auth-middleware'
import { processUploadedDocument } from '@/lib/document-processor'
import { getConfig } from '@/lib/config'
import type { Database } from '@/types/database'

async function processDocumentHandler(req: AuthenticatedRequest, res: NextApiResponse) {
  const requestId = `proc-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
  const startTime = Date.now()
  
  console.log(`[${requestId}] Process Document API: Request received`, {
    method: req.method,
    userAgent: req.headers['user-agent'],
    origin: req.headers.origin,
    userId: req.user?.id,
    timestamp: new Date().toISOString()
  })

  if (req.method !== 'POST') {
    console.log(`[${requestId}] Process Document API: Method not allowed:`, req.method)
    return apiError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED')
  }

  try {
    const { fileName, originalFileName, fileSize, userId } = req.body
    
    console.log(`[${requestId}] Process Document API: Request body parsed`, {
      hasFileName: !!fileName,
      hasOriginalFileName: !!originalFileName,
      hasFileSize: !!fileSize,
      hasUserId: !!userId,
      fileName,
      originalFileName,
      fileSize,
      userId
    })

    // Validate required fields
    if (!fileName || !originalFileName || !fileSize || !userId) {
      const missingFields = []
      if (!fileName) missingFields.push('fileName')
      if (!originalFileName) missingFields.push('originalFileName')
      if (!fileSize) missingFields.push('fileSize')
      if (!userId) missingFields.push('userId')
      
      console.log(`[${requestId}] Process Document API: Missing required fields:`, missingFields)
      return apiError(res, 400, `Missing required fields: ${missingFields.join(', ')}`, 'MISSING_FIELDS')
    }

    // Verify the userId matches the authenticated user
    if (userId !== req.user.id) {
      console.log(`[${requestId}] Process Document API: User ID mismatch`, {
        requestUserId: userId,
        authenticatedUserId: req.user.id
      })
      return apiError(res, 403, 'User ID mismatch', 'USER_MISMATCH')
    }

    console.log(`[${requestId}] Process Document API: Starting processing for:`, originalFileName, {
      fileName,
      fileSize,
      userId
    })

    // Initialize Supabase client
    const config = getConfig()
    console.log(`[${requestId}] Process Document API: Initializing Supabase client`, {
      hasUrl: !!config.supabase.url,
      hasServiceKey: !!config.supabase.serviceRoleKey,
      urlPrefix: config.supabase.url?.substring(0, 20) + '...' || 'missing'
    })
    
    const supabase = createClient<Database>(
      config.supabase.url,
      config.supabase.serviceRoleKey
    )

    // Download the file from Supabase Storage
    console.log(`[${requestId}] Process Document API: Attempting to download file from storage`, {
      fileName,
      bucket: 'documents'
    })
    
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from('documents')
      .download(fileName)

    if (downloadError) {
      console.error(`[${requestId}] Process Document API: Download error:`, {
        error: downloadError,
        fileName,
        message: downloadError.message,
        statusCode: (downloadError as any).statusCode || 'unknown'
      })
      return apiError(res, 404, `File not found: ${downloadError.message}`, 'FILE_NOT_FOUND')
    }

    // Convert to buffer for processing
    const arrayBuffer = await fileData.arrayBuffer()
    const fileBuffer = Buffer.from(arrayBuffer)

    console.log(`[${requestId}] Process Document API: File downloaded successfully`, {
      fileName,
      bufferSize: fileBuffer.length,
      originalFileSize: fileSize,
      bufferMatch: Math.abs(fileBuffer.length - fileSize) < 1000 // Allow for small differences
    })

    // Process the document
    console.log(`[${requestId}] Process Document API: Starting document processing`)
    const processingStart = Date.now()
    
    const processingResult = await processUploadedDocument(
      fileBuffer,
      fileName,
      originalFileName,
      fileName, // storagePath is the same as fileName
      fileSize,
      userId
    )
    
    const processingTime = Date.now() - processingStart
    console.log(`[${requestId}] Process Document API: Document processing completed`, {
      success: processingResult.success,
      processingTimeMs: processingTime,
      hasDocument: !!processingResult.document,
      hasError: !!processingResult.error
    })

    // Strict validation - verify actual chunk count
    const { count } = await supabaseAdmin
      .from('document_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('document_id', processingResult.document.id)
    
    console.log('[OM-AI] ingest done', { 
      documentId: processingResult.document.id, 
      chunkCount: count ?? 0 
    })
    
    if (!count || count === 0) {
      return res.status(422).json({
        success: false,
        code: 'NO_CHUNKS',
        message: 'Document processing produced no chunks'
      })
    }

    const totalTime = Date.now() - startTime
    console.log(`[${requestId}] Process Document API: Successfully completed`, {
      originalFileName,
      documentId: processingResult.document?.id,
      totalTimeMs: totalTime,
      processingTimeMs: processingTime
    })

    // Return success response
    res.status(200).json({
      success: true,
      document: processingResult.document,
      chunkCount: count,
      meta: {
        requestId,
        processingTime: processingTime,
        totalTime: totalTime
      }
    })

  } catch (error) {
    // Map specific errors to 422
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as any).code;
      if (code === 'NO_PDF_TEXT' || code === 'NO_CHUNKS' || code === 'PARSE_FAILED') {
        return res.status(422).json({ success: false, code, message: String((error as any).message) });
      }
    }
    
    const totalTime = Date.now() - startTime
    console.error(`[${requestId}] Process Document API: Fatal error:`, {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      totalTimeMs: totalTime,
      originalFileName: req.body?.originalFileName,
      fileName: req.body?.fileName,
      userId: req.body?.userId
    })
    return apiError(res, 500, 'Processing failed', 'PROCESSING_ERROR', 
      error instanceof Error ? error.message : 'Unknown error')
  }
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return withAuth(req, res, processDocumentHandler)
}