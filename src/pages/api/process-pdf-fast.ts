import { NextApiRequest, NextApiResponse } from 'next'
import { withAuth, AuthenticatedRequest, apiError } from '@/lib/auth-middleware'
import { PDFParserAgent } from '@/lib/agents/pdf-parser'
import { PDFValidator } from '@/lib/validation'
import { transientStore } from '@/lib/transient-store'
import { v4 as uuidv4 } from 'uuid'

// KV storage for tracking recent documents
let kvStore: any = null
try {
  // Dynamically import KV to avoid build issues when not configured
  const { kv } = require('@vercel/kv')
  kvStore = kv
} catch (error) {
  console.log('[process-pdf-fast] KV not available, using fallback storage')
}

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
  docId: string
  title: string
  pagesIndexed: number
  processingTime: number
  status: 'partial' | 'complete'
  backgroundProcessing: boolean
}

async function processPdfFastHandler(req: AuthenticatedRequest, res: NextApiResponse<ProcessPdfResponse>) {
  if (req.method !== 'POST') {
    return apiError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED')
  }

  const startTime = Date.now()

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

    // Generate unique document ID
    const docId = `doc-${Date.now()}-${uuidv4().substring(0, 8)}`

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

      // Store chunks in transient store for immediate access
      const transientChunks = parseResult.chunks.map((chunk, index) => ({
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

      // Store with user isolation
      const memoryId = `mem-${req.user.id}-${Date.now()}`
      transientStore.setChunks(memoryId, transientChunks, { ttlMs: 30 * 60 * 1000 }) // 30 minutes

      // Start background processing for remaining pages (fire and forget)
      if (parseResult.pages.length >= 15) {
        processRemainingPages(file_url, docId, req.user.id, memoryId, 15)
          .catch(error => console.error('[process-pdf-fast] Background processing failed:', error))
      }

      const processingTime = Date.now() - startTime
      console.log(`[process-pdf-fast] Fast processing completed in ${processingTime}ms`)

      // Extract title from filename (remove path and extension)
      const title = file_key.split('/').pop()?.replace(/\.pdf$/i, '') || 'Untitled Document'

      // Track recent documents for user
      await trackRecentDocument(req.user.id, memoryId).catch(error => 
        console.warn('[process-pdf-fast] Failed to track recent document:', error)
      )

      const response: ProcessPdfResponse = {
        docId: memoryId, // Use memory ID as document ID for immediate access
        title,
        pagesIndexed: parseResult.pages.length,
        processingTime,
        status: parseResult.pages.length >= 15 ? 'partial' : 'complete',
        backgroundProcessing: parseResult.pages.length >= 15
      }

      return res.status(200).json(response)

    } finally {
      await pdfParser.cleanup()
    }

  } catch (error) {
    const processingTime = Date.now() - startTime
    console.error('[process-pdf-fast] Processing error:', error)
    
    return apiError(res, 500, 'PDF processing failed', 'PROCESSING_ERROR',
      error instanceof Error ? error.message : 'Unknown error')
  }
}

// Background processing for remaining pages
async function processRemainingPages(
  file_url: string, 
  docId: string, 
  userId: string, 
  memoryId: string,
  startPage: number
) {
  console.log(`[process-pdf-fast] Starting background processing from page ${startPage}`)
  
  // Download full file for complete processing
  const fullResponse = await fetch(file_url)
  const fullBuffer = Buffer.from(await fullResponse.arrayBuffer())
  
  const pdfParser = new PDFParserAgent()
  
  try {
    // Process remaining pages
    const fullParseResult = await pdfParser.parseBuffer(fullBuffer, {
      extractTables: true,
      performOCR: false,
      chunkSize: 4000,
      preserveFormatting: true,
      useCanvas: false,
      startPage: startPage + 1 // Continue from where fast processing left off
    })

    if (fullParseResult?.success && fullParseResult.chunks?.length) {
      // Merge with existing chunks in transient store
      const existingChunks = transientStore.getChunks(memoryId) || []
      
      const newChunks = fullParseResult.chunks.map((chunk, index) => ({
        id: chunk.id || `chunk-bg-${index}`,
        text: chunk.content || chunk.text || '',
        page: chunk.page_number ?? chunk.page ?? startPage + 1,
        chunk_index: (chunk.chunk_index ?? index) + existingChunks.length,
        metadata: {
          type: chunk.type || 'text',
          tokens: chunk.tokens || 0,
          backgroundProcessing: true
        }
      }))

      // Update transient store with complete document
      const allChunks = [...existingChunks, ...newChunks]
      transientStore.setChunks(memoryId, allChunks, { ttlMs: 60 * 60 * 1000 }) // Extend to 1 hour

      console.log(`[process-pdf-fast] Background processing completed: ${allChunks.length} total chunks`)
    }

  } catch (error) {
    console.error('[process-pdf-fast] Background processing error:', error)
  } finally {
    await pdfParser.cleanup()
  }
}

// Track recent documents for user context
async function trackRecentDocument(userId: string, docId: string): Promise<void> {
  if (!kvStore) {
    console.log('[process-pdf-fast] KV not available, skipping recent doc tracking')
    return
  }

  try {
    const recentKey = `recent:${userId}:docIds`
    
    // Get current list (if any)
    const currentList: string[] = await kvStore.get(recentKey) || []
    
    // Add new docId to front, remove duplicates, limit to 3
    const updatedList = [docId, ...currentList.filter(id => id !== docId)].slice(0, 3)
    
    // Store with 10-minute TTL (600 seconds)
    await kvStore.set(recentKey, updatedList, { ex: 600 })
    
    console.log(`[process-pdf-fast] Tracked recent document: ${docId} for user: ${userId}`)
  } catch (error) {
    console.error('[process-pdf-fast] Failed to track recent document:', error)
    throw error
  }
}

export default withAuth(processPdfFastHandler)