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
    const { bucket, path, originalFilename, fileSize, contentType, fileName, originalFileName } = req.body
    
    // Support both old and new payload formats during transition
    const finalBucket = bucket || 'documents'
    const finalPath = path || fileName
    const finalOriginalFilename = originalFilename || originalFileName
    
    console.log(`[${requestId}] Process Document API: Request body parsed`, {
      bucket: finalBucket,
      path: finalPath,
      hasPath: !!finalPath,
      hasOriginalFileName: !!originalFileName,
      hasFileSize: !!fileSize,
      fileName,
      originalFileName,
      fileSize
    })

    // Validate required fields
    if (!finalPath || !finalOriginalFilename || !fileSize) {
      const missingFields = []
      if (!finalPath) missingFields.push('path/fileName')
      if (!finalOriginalFilename) missingFields.push('originalFilename/originalFileName')
      if (!fileSize) missingFields.push('fileSize')
      
      console.log(`[${requestId}] Process Document API: Missing required fields:`, missingFields)
      return apiError(res, 400, `Missing required fields: ${missingFields.join(', ')}`, 'MISSING_FIELDS')
    }

    // Extract userId from path (format: userId/filename.pdf)
    const pathUserId = String(finalPath).split('/')[0]
    if (!pathUserId) {
      console.log(`[${requestId}] Process Document API: Unable to extract userId from path:`, finalPath)
      return apiError(res, 400, 'Invalid path format', 'INVALID_PATH')
    }

    // Verify the path userId matches the authenticated user
    if (pathUserId !== req.user.id) {
      console.log(`[${requestId}] Process Document API: User ID mismatch`, {
        pathUserId,
        authenticatedUserId: req.user.id,
        path: finalPath
      })
      return apiError(res, 403, 'User ID mismatch', 'USER_MISMATCH')
    }

    console.log(`[${requestId}] Process Document API: Starting processing for:`, finalOriginalFilename, {
      fileName,
      fileSize,
      userId: pathUserId
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

    // Download the file from Supabase Storage with retry logic (race condition protection)
    console.log(`[${requestId}] Process Document API: Attempting to download file from storage`, {
      path: finalPath,
      bucket: finalBucket
    })
    
    let fileData = null
    let downloadError = null
    let attempts = 0
    const maxAttempts = 5
    
    while (!fileData && attempts < maxAttempts) {
      attempts++
      
      if (attempts > 1) {
        const delay = Math.min(300 * Math.pow(2, attempts - 2), 2000) // 300ms → 2000ms exponential backoff
        console.log(`[${requestId}] Process Document API: File download attempt ${attempts}, waiting ${delay}ms`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
      
      const result = await supabase
        .storage
        .from(finalBucket)
        .download(finalPath)
        
      fileData = result.data
      downloadError = result.error
      
      if (fileData) {
        console.log(`[${requestId}] Process Document API: File downloaded successfully on attempt ${attempts}`)
        break
      } else if (downloadError && attempts < maxAttempts) {
        console.log(`[${requestId}] Process Document API: Download attempt ${attempts} failed, retrying:`, {
          error: downloadError.message,
          path: finalPath
        })
      }
    }

    if (downloadError && !fileData) {
      // If all retries failed, return 409 PENDING_UPLOAD instead of 500 (not an error, just timing)
      console.log(`[${requestId}] Process Document API: File not found after ${maxAttempts} attempts, returning 409`, {
        error: downloadError,
        path: finalPath,
        message: downloadError.message,
        statusCode: (downloadError as any).statusCode || 'unknown'
      })
      
      return res.status(409).json({
        success: false,
        code: 'PENDING_UPLOAD',
        message: 'File upload may still be in progress. Please try again.',
        retryAfterMs: 1500
      })
    }

    // Final null check after retry loop (race condition safety)
    if (!fileData) {
      console.log(`[${requestId}] Process Document API: File data null after retries, returning 409`, {
        path: finalPath,
        attempts: maxAttempts
      })
      
      return res.status(409).json({
        success: false,
        code: 'PENDING_UPLOAD',
        message: 'File upload still processing after retries',
        retryAfterMs: 1500
      })
    }

    // Convert to buffer for processing
    const arrayBuffer = await fileData.arrayBuffer()
    const fileBuffer = Buffer.from(arrayBuffer)

    console.log(`[${requestId}] Process Document API: File downloaded successfully`, {
      path: finalPath,
      bufferSize: fileBuffer.length,
      originalFileSize: fileSize,
      bufferMatch: Math.abs(fileBuffer.length - fileSize) < 1000 // Allow for small differences
    })

    // Process the document
    console.log(`[${requestId}] Process Document API: Starting document processing`)
    const processingStart = Date.now()
    
    const processingResult = await processUploadedDocument(
      fileBuffer,
      finalPath,
      finalOriginalFilename,
      finalPath, // storagePath is the same as path
      fileSize,
      req.user.id // Use authenticated user ID
    )
    
    const processingTime = Date.now() - processingStart
    console.log(`[${requestId}] Process Document API: Document processing completed`, {
      success: processingResult.success,
      processingTimeMs: processingTime,
      hasDocument: !!processingResult.document,
      hasError: !!processingResult.error
    })

    const documentId = processingResult.document?.id
    if (!documentId) {
      return res.status(500).json({
        success: false,
        code: 'NO_DOCUMENT',
        message: 'Document missing after processing'
      })
    }

    // Strict validation - verify actual chunk count
    const { count } = await supabaseAdmin
      .from('document_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('document_id', documentId)
    
    console.log('[OM-AI] ingest done', { 
      documentId: processingResult.document?.id, 
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
      path: req.body?.path,
      authenticatedUserId: req.user?.id
    })
    return apiError(res, 500, 'Processing failed', 'PROCESSING_ERROR', 
      error instanceof Error ? error.message : 'Unknown error')
  }
}

export default withAuth(processDocumentHandler)