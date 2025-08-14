import type { NextApiRequest, NextApiResponse } from 'next'
import formidable from 'formidable'
import { promises as fs } from 'fs'
import { withAuth, type AuthenticatedRequest } from '@/lib/auth-middleware'
import { processInMemory } from '@/lib/document-processor'

// Force Node.js runtime for singleton consistency
export const runtime = 'nodejs'

// Let formidable handle multipart parsing
export const config = { 
  api: { 
    bodyParser: false 
  } 
}

// Size limit from environment with 8MB default
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB ?? 8)
const MAX_BYTES = MAX_UPLOAD_MB * 1024 * 1024

interface ErrorResponse {
  requestId: string
  code: string
  message: string
  limitBytes?: number
  receivedBytes?: number
}

interface SuccessResponse {
  requestId: string
  success: boolean
  document: {
    originalFilename: string
    pageCount: number
    chunkCount: number
    analysis: any
  }
  metadata: {
    originalFilename: string
    pageCount: number
    chunkCount: number
    userId: string
  }
  processingTimeMs: number
}

async function processMemoryHandler(req: AuthenticatedRequest, res: NextApiResponse<SuccessResponse | ErrorResponse>) {
  // Generate unique request ID for tracking
  const requestId = `req-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`
  const startTime = Date.now()

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    const error = { requestId, code: 'METHOD_NOT_ALLOWED', message: 'Method Not Allowed' }
    console.error('[process-pdf-memory]', error)
    return res.status(405).json(error)
  }

  try {
    // Early size check via Content-Length to prevent memory allocation
    const contentLength = req.headers['content-length']
    if (contentLength) {
      const size = parseInt(contentLength, 10)
      if (size > MAX_BYTES) {
        const error = {
          requestId,
          code: 'E_SIZE_LIMIT',
          message: `File size ${(size / 1024 / 1024).toFixed(1)}MB exceeds ${MAX_UPLOAD_MB}MB limit`,
          limitBytes: MAX_BYTES,
          receivedBytes: size
        }
        console.error(`[process-pdf-memory] requestId=${requestId} code=E_SIZE_LIMIT msg="Content-Length ${size} exceeds ${MAX_UPLOAD_MB}MB limit" userId=${req.user.id} limit=${MAX_BYTES} received=${size}`)
        return res.status(413).json(error)
      }
    }

    // Validate Content-Type
    const contentType = req.headers['content-type']
    if (!contentType || !contentType.includes('multipart/form-data')) {
      const error = {
        requestId,
        code: 'E_UNSUPPORTED_TYPE',
        message: 'Content-Type must be multipart/form-data'
      }
      console.error(`[process-pdf-memory] requestId=${requestId} code=E_UNSUPPORTED_TYPE msg="Invalid Content-Type" userId=${req.user.id} contentType=${contentType}`)
      return res.status(415).json(error)
    }

    // Configure formidable with explicit limits
    const form = formidable({ 
      maxFileSize: MAX_BYTES,
      maxTotalFileSize: MAX_BYTES,
      multiples: false 
    })

    let files: formidable.Files
    try {
      ({ files } = await new Promise<{ files: formidable.Files }>((resolve, reject) => {
        form.parse(req, (err, _fields, files) => {
          if (err) reject(err)
          else resolve({ files })
        })
      }))
    } catch (formidableError: any) {
      // Handle formidable size errors
      if (formidableError.code === 'ETOOBIG') {
        const error = {
          requestId,
          code: 'E_SIZE_LIMIT',
          message: `File exceeds ${MAX_UPLOAD_MB}MB limit`,
          limitBytes: MAX_BYTES,
          receivedBytes: MAX_BYTES + 1 // formidable doesn't provide exact size, so estimate
        }
        console.error(`[process-pdf-memory] requestId=${requestId} code=E_SIZE_LIMIT msg="Formidable ETOOBIG" userId=${req.user.id} limit=${MAX_BYTES} (${MAX_UPLOAD_MB}MB)`)
        return res.status(413).json(error)
      }
      throw formidableError
    }

    // Validate exactly one file
    const anyFile = (files.file || files.document || Object.values(files)[0]) as formidable.File | formidable.File[] | undefined
    if (!anyFile) {
      const error = {
        requestId,
        code: 'E_NO_FILE',
        message: 'No file uploaded'
      }
      console.error(`[process-pdf-memory] requestId=${requestId} code=E_NO_FILE msg="No file in request" userId=${req.user.id}`)
      return res.status(400).json(error)
    }

    const file = Array.isArray(anyFile) ? anyFile[0] : anyFile
    const filepath = (file as any).filepath || (file as any).path
    const originalFilename = (file as any).originalFilename || (file as any).newFilename || 'document.pdf'

    // Validate file type: PDF mimetype OR .pdf extension
    const mimetype = (file as any).mimetype || (file as any).type || ''
    const isPdfMime = mimetype === 'application/pdf'
    const isPdfExtension = originalFilename.toLowerCase().endsWith('.pdf')
    
    if (!isPdfMime && !isPdfExtension) {
      const error = {
        requestId,
        code: 'E_UNSUPPORTED_TYPE',
        message: 'File must be a PDF (application/pdf mimetype or .pdf extension)'
      }
      console.error(`[process-pdf-memory] requestId=${requestId} code=E_UNSUPPORTED_TYPE msg="Not PDF" userId=${req.user.id} file=${originalFilename} mime=${mimetype}`)
      return res.status(415).json(error)
    }

    // Check canvas status (never fail on unavailability)
    const USE_CANVAS = process.env.USE_CANVAS === 'true'
    let canvasStatus: any = { available: false, reason: 'Canvas disabled via USE_CANVAS environment variable' }
    
    if (USE_CANVAS) {
      try {
        const { getCanvasStatus } = await import('@/lib/canvas-loader')
        canvasStatus = getCanvasStatus()
      } catch (error) {
        console.warn(`[process-pdf-memory] requestId=${requestId} Canvas loader failed:`, error)
        canvasStatus = { available: false, reason: 'Canvas loader failed to import' }
      }
    }
    
    console.log(`[process-pdf-memory] requestId=${requestId} Starting processing userId=${req.user.id} file=${originalFilename} size=${file.size} limit=${MAX_BYTES} (${MAX_UPLOAD_MB}MB) canvas=${canvasStatus.available ? 'enabled' : 'disabled'}`)

    // Read file buffer
    const buffer = await fs.readFile(filepath)

    // Process PDF in memory
    let result
    try {
      result = await processInMemory(buffer, {
        userId: req.user.id,
        originalFilename,
        useCanvas: USE_CANVAS && canvasStatus.available
      })
    } catch (processingError: any) {
      // Map known processing errors to specific codes
      let code = 'PROCESSING_ERROR'
      let message = processingError.message || 'Processing failed'
      let statusCode = 500

      if (processingError.message?.includes('password') || processingError.message?.includes('encrypted')) {
        code = 'PDF_UNREADABLE'
        message = 'PDF is password-protected or encrypted'
        statusCode = 422
      } else if (processingError.message?.includes('No extractable text') || processingError.message?.includes('image-only')) {
        code = 'NO_PDF_TEXT'
        message = 'PDF contains no readable text (likely image-only)'
        statusCode = 422
      } else if (processingError.message?.toLowerCase().includes('timeout') || processingError.message?.toLowerCase().includes('timed out')) {
        code = 'PDF_PARSE_TIMEOUT'
        message = 'PDF processing timed out'
        statusCode = 422
      } else if (processingError.message?.includes('corrupt') || processingError.message?.includes('invalid')) {
        code = 'PDF_UNREADABLE'
        message = 'PDF file is corrupted or invalid'
        statusCode = 422
      }

      const error = { requestId, code, message }
      console.error(`[process-pdf-memory] requestId=${requestId} code=${code} msg="${message}" userId=${req.user.id} file=${originalFilename} size=${file.size} error=${processingError.name}`)
      return res.status(statusCode).json(error)
    }

    const processingTimeMs = Date.now() - startTime

    // Add requestId for frontend compatibility (override any existing requestId from result)
    const response: SuccessResponse = {
      success: true,
      ...result,
      requestId, // Use our generated requestId
      processingTimeMs
    }

    console.log(`[process-pdf-memory] requestId=${requestId} code=SUCCESS msg="Processing completed" userId=${req.user.id} file=${originalFilename} size=${file.size} pages=${result.document.pageCount} chunks=${result.document.chunkCount} timeMs=${processingTimeMs}`)

    return res.status(200).json(response)

  } catch (error: any) {
    const processingTimeMs = Date.now() - startTime
    const errorResponse = {
      requestId,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error'
    }

    console.error(`[process-pdf-memory] requestId=${requestId} code=INTERNAL_ERROR msg="${error.message}" userId=${req.user.id} timeMs=${processingTimeMs} error=${error.name} stack=${error.stack}`)
    return res.status(500).json(errorResponse)
  }
}

export default withAuth(processMemoryHandler)