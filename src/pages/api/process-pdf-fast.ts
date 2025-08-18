import { NextApiRequest, NextApiResponse } from 'next'
import { withAuth, AuthenticatedRequest, apiError } from '@/lib/auth-middleware'
import { PDFParserAgent } from '@/lib/agents/pdf-parser'
import { PDFValidator } from '@/lib/validation'
import { ulid } from 'ulid'
import crypto from 'crypto'
import * as kvStore from '@/lib/kv-store'
import { structuredLog, generateRequestId } from '@/lib/log'

// Force Node.js runtime for KV consistency
export const runtime = 'nodejs'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb'
    }
  },
  maxDuration: 60
}

interface ProcessPdfRequest {
  file_key: string
  file_url: string
}

interface ProcessPdfResponse {
  documentId: string  // Changed from docId to documentId for consistency
  title: string
  pagesIndexed: number
  processingTime: number
  status: 'ready' | 'processing' | 'error'
  backgroundProcessing?: boolean
}

async function processPdfFastHandler(req: AuthenticatedRequest, res: NextApiResponse<ProcessPdfResponse | any>) {
  if (req.method !== 'POST') {
    return apiError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED')
  }

  const startTime = Date.now()
  const requestId = generateRequestId('pdf')
  const userId = req.user.id

  // Check KV availability
  if (!kvStore.isKvAvailable()) {
    structuredLog('error', 'KV store unavailable', {
      documentId: 'none',
      userId,
      kvWrite: false,
      status: 'error',
      request_id: requestId
    })
    return res.status(503).json({
      error: 'Ephemeral store unavailable',
      code: 'KV_UNAVAILABLE',
      details: 'The context storage service is currently unavailable. Please try again later.'
    })
  }

  try {
    const { file_key, file_url }: ProcessPdfRequest = req.body

    if (!file_key || !file_url) {
      return apiError(res, 400, 'file_key and file_url are required', 'INVALID_REQUEST')
    }

    console.log(`[process-pdf-fast] Starting fast processing for ${file_key}`)

    // Use the provided URL directly (no manual construction)
    const response = await fetch(file_url, {
      // Request only first 5MB for fast parsing
      headers: {
        'Range': 'bytes=0-5242880'
      }
    })
    
    if (!response.ok && response.status !== 206) { // 206 is partial content
      console.error(`[process-pdf-fast] Failed to fetch file: ${response.status} ${response.statusText}`)
      return apiError(res, 404, 'File not found in storage', 'FILE_NOT_FOUND')
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    console.log(`[process-pdf-fast] Downloaded ${buffer.length} bytes (partial)`)

    // Quick validation (minimal for speed)
    const quickValidation = PDFValidator.quickValidate(buffer)
    if (!quickValidation.isValid) {
      return apiError(res, 400, quickValidation.error || 'Invalid PDF file', 'INVALID_PDF')
    }

    // Generate server-side document ID with mem- prefix
    const documentId = `mem-${ulid()}`
    
    // Set processing status immediately
    await kvStore.setStatus(documentId, 'processing')
    
    structuredLog('info', 'Starting PDF processing', {
      documentId,
      userId,
      kvWrite: true,
      status: 'processing',
      request_id: requestId
    })

    // Fast parse: first 15 pages only
    const pdfParser = new PDFParserAgent()
    
    try {
      const parseResult = await pdfParser.parseBuffer(buffer, {
        extractTables: false, // Skip tables for speed
        performOCR: false,    // Skip OCR for speed
        chunkSize: 3000,      // Smaller chunks for faster processing
        maxPages: 15,         // Only first 15 pages
        preserveFormatting: false, // Skip formatting for speed
        useCanvas: false      // Text-only for speed
      })

      if (!parseResult?.success || !parseResult.chunks?.length) {
        console.error('[process-pdf-fast] No content extracted from PDF')
        return apiError(res, 422, 'No extractable content in PDF', 'NO_CONTENT')
      }

      console.log(`[process-pdf-fast] Fast parse completed: ${parseResult.chunks.length} chunks from ${parseResult.pages.length} pages`)

      // Prepare chunks for KV storage
      const kvChunks = parseResult.chunks.map((chunk, index) => ({
        id: chunk.id || `chunk-${index}`,
        text: chunk.content || chunk.text || '',
        page: chunk.page_number ?? chunk.page ?? 1,
        chunk_index: chunk.chunk_index ?? index,
        metadata: {
          type: chunk.type || 'text',
          tokens: chunk.tokens || 0,
          fastProcessing: true
        }
      }))

      // Calculate content hash for deduplication
      const contentHash = crypto
        .createHash('sha256')
        .update(kvChunks.map(c => c.text).join(''))
        .digest('hex')
        .substring(0, 16)

      // Store context in KV
      const contextStored = await kvStore.setContext(documentId, userId, {
        chunks: kvChunks,
        userId,
        meta: {
          pagesIndexed: parseResult.pages.length,
          processingTime: Date.now() - startTime,
          contentHash,
          originalFilename: file_key.split('/').pop()?.replace(/\.pdf$/i, '') || 'document.pdf'
        }
      })

      if (!contextStored) {
        await kvStore.setStatus(documentId, 'error', 'Failed to store context')
        structuredLog('error', 'Failed to store context in KV', {
          documentId,
          userId,
          kvWrite: false,
          status: 'error',
          request_id: requestId
        })
        return apiError(res, 500, 'Failed to store document context', 'STORAGE_ERROR')
      }

      // Set status to ready
      await kvStore.setStatus(documentId, 'ready')
      
      // Start background processing for remaining pages (fire and forget)
      if (parseResult.pages.length >= 15) {
        processRemainingPages(file_url, documentId, userId, 15)
          .catch(error => console.error('[process-pdf-fast] Background processing failed:', error))
      }

      const processingTime = Date.now() - startTime
      console.log(`[process-pdf-fast] Fast processing completed in ${processingTime}ms`)

      // Extract title from filename (remove path and extension)
      const title = file_key.split('/').pop()?.replace(/\.pdf$/i, '') || 'Untitled Document'

      structuredLog('info', 'PDF processing completed', {
        documentId,
        userId,
        kvWrite: true,
        status: 'ready',
        parts: 1, // Will be updated if multi-part
        request_id: requestId
      })

      const response: ProcessPdfResponse = {
        documentId, // Return server-generated ID
        title,
        pagesIndexed: parseResult.pages.length,
        processingTime,
        status: 'ready',
        ...(parseResult.pages.length >= 15 && { backgroundProcessing: true })
      }

      return res.status(200).json(response)

    } finally {
      await pdfParser.cleanup()
    }

  } catch (error) {
    const processingTime = Date.now() - startTime
    
    // Set error status if we have a documentId
    if (typeof documentId !== 'undefined') {
      await kvStore.setStatus(documentId, 'error', error instanceof Error ? error.message : 'Unknown error')
    }
    
    structuredLog('error', 'PDF processing failed', {
      documentId: typeof documentId !== 'undefined' ? documentId : 'none',
      userId,
      kvWrite: false,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      request_id: requestId
    })
    
    return apiError(res, 500, 'PDF processing failed', 'PROCESSING_ERROR',
      error instanceof Error ? error.message : 'Unknown error')
  }
}

// Background processing for remaining pages
async function processRemainingPages(
  file_url: string, 
  documentId: string, 
  userId: string,
  startPage: number
) {
  console.log(`[process-pdf-fast] Starting background processing from page ${startPage}`)
  
  // Download full file for complete processing
  const fullResponse = await fetch(file_url)
  const fullBuffer = Buffer.from(await fullResponse.arrayBuffer())
  
  const pdfParser = new PDFParserAgent()
  
  try {
    // full pass (no unsupported startPage option)
    const fullParseResult = await pdfParser.parseBuffer(fullBuffer, {
      extractTables: true,
      performOCR: false,
      chunkSize: 4000,
      preserveFormatting: true,
      useCanvas: false
    })

    // Only keep pages AFTER the fast pass
    const chunksAfter = (fullParseResult?.chunks ?? []).filter((c: any) => {
      const p =
        (c?.page as number | undefined) ??
        (c?.pageNumber as number | undefined) ??
        (c?.page_number as number | undefined) ??
        (c?.metadata?.page as number | undefined) ??
        0
      return p > startPage
    })

    if (fullParseResult?.success && chunksAfter.length) {
      // Get existing context from KV
      const existingContext = await kvStore.getContext(documentId, userId)
      
      if (existingContext) {
        const newChunks = chunksAfter.map((chunk, index) => ({
          id: chunk.id || `chunk-bg-${index}`,
          text: chunk.content || chunk.text || '',
          page: chunk.page_number ?? chunk.page ?? startPage + 1,
          chunk_index: (chunk.chunk_index ?? index) + existingContext.chunks.length,
          metadata: {
            type: chunk.type || 'text',
            tokens: chunk.tokens || 0,
            backgroundProcessing: true
          }
        }))

        // Update KV with complete document
        const allChunks = [...existingContext.chunks, ...newChunks]
        await kvStore.setContext(documentId, userId, {
          ...existingContext,
          chunks: allChunks
        })

        console.log(`[process-pdf-fast] Background processing completed: ${allChunks.length} total chunks`)
      }
    }

  } catch (error) {
    console.error('[process-pdf-fast] Background processing error:', error)
  } finally {
    await pdfParser.cleanup()
  }
}

export default withAuth(processPdfFastHandler)