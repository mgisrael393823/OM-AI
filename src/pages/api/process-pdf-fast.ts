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
  let documentId: string | undefined // Declare here for catch block access

  // Check storage availability - only return 503 in preview/production when KV is truly unavailable
  const isDev = process.env.NODE_ENV === 'development'
  const isMemoryMode = kvStore.getAdapter() === 'memory'
  
  if (!isDev && !isMemoryMode && !kvStore.isKvAvailable()) {
    structuredLog('error', 'KV store unavailable in production', {
      documentId: undefined,
      userId,
      kvWrite: false,
      adapter: kvStore.getAdapter(),
      status: 'error',
      requestId: requestId
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
    documentId = `mem-${ulid()}`
    
    // Set processing status immediately
    await kvStore.setStatus(documentId, 'processing', undefined, 0)
    
    structuredLog('info', 'Starting PDF processing', {
      documentId,
      userId,
      kvWrite: true,
      status: 'processing',
      requestId: requestId
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

      // Calculate content hash for deduplication (40 chars for collision safety)
      const contentHash = crypto
        .createHash('sha256')
        .update(buffer)
        .digest('hex')
        .substring(0, 40)

      // Store context with retry logic for memory operations
      const contextToStore = {
        chunks: kvChunks,
        userId,
        meta: {
          pagesIndexed: parseResult.pages.length,
          processingTime: Date.now() - startTime,
          contentHash,
          originalFilename: file_key.split('/').pop()?.replace(/\.pdf$/i, '') || 'document.pdf'
        }
      }
      
      let contextStored = await kvStore.setContext(documentId, userId, contextToStore)
      
      // Read-after-write validation
      if (contextStored) {
        const readBack = await kvStore.getContext(documentId, userId)
        if (!readBack || readBack.chunks.length !== kvChunks.length) {
          console.warn(`[process-pdf-fast] Read-after-write validation failed for ${documentId}`)
          contextStored = false
        } else {
          console.log(`[process-pdf-fast] Read-after-write validation passed: ${readBack.chunks.length} chunks`)
        }
      }

      // Retry logic for memory adapter (up to 2 retries)
      if (!contextStored && kvStore.getAdapter() === 'memory') {
        for (let attempt = 1; attempt <= 2; attempt++) {
          console.log(`[process-pdf-fast] Memory storage failed, retrying attempt ${attempt}/2`)
          await new Promise(resolve => setTimeout(resolve, 100 * attempt)) // Brief delay
          
          contextStored = await kvStore.setContext(documentId, userId, contextToStore)
          
          // Read-after-write validation for retry
          if (contextStored) {
            const retryReadBack = await kvStore.getContext(documentId, userId)
            if (!retryReadBack || retryReadBack.chunks.length !== kvChunks.length) {
              console.warn(`[process-pdf-fast] Retry read-after-write validation failed for ${documentId}`)
              contextStored = false
            }
          }
          
          if (contextStored) {
            console.log(`[process-pdf-fast] Memory storage succeeded on retry ${attempt}`)
            break
          }
        }
      }

      if (!contextStored) {
        await kvStore.setStatus(documentId, 'error', 'Failed to store context', 0)
        structuredLog('error', 'Failed to store context', {
          documentId,
          userId,
          kvWrite: false,
          adapter: kvStore.getAdapter(),
          status: 'error',
          requestId: requestId
        })
        
        // For memory mode, continue with warning instead of failing
        if (kvStore.getAdapter() === 'memory') {
          console.warn(`[process-pdf-fast] Memory storage failed after retries, continuing without persistence`)
        } else {
          return apiError(res, 500, 'Failed to store document context', 'STORAGE_ERROR')
        }
      }

      const partsCount = kvChunks.length
      const DEFAULT_MIN_PARTS = parseInt(process.env.MIN_PARTS || '5', 10)
      const requiredParts = Math.min(
        DEFAULT_MIN_PARTS,
        Math.max(1, Math.ceil(parseResult.pages.length / 2))
      )

      if (partsCount < requiredParts) {
        await kvStore.setStatus(documentId, 'processing', undefined, partsCount)
        return res.status(202).json({
          documentId,
          title: contextToStore.meta.originalFilename,
          pagesIndexed: parseResult.pages.length,
          processingTime: Date.now() - startTime,
          status: 'processing',
          backgroundProcessing: true
        })
      }

      // Set status to ready
      await kvStore.setStatus(documentId, 'ready', undefined, partsCount)
      
      // CRITICAL: Schedule deal points extraction asynchronously (non-blocking)
      setImmediate(async () => {
        try {
          console.log(`[process-pdf-fast] Starting async deal points extraction for ${documentId}`)
          const dealPoints = await extractDealPoints(kvChunks, contentHash, requestId)
          if (dealPoints) {
            const dealPointsKey = `dealPoints:${contentHash}`
            await kvStore.setItem(dealPointsKey, dealPoints, 
              process.env.NODE_ENV === 'development' ? 7 * 24 * 60 * 60 * 1000 : undefined // 7 days TTL in dev
            )
            
            structuredLog('info', 'Deal points extracted and cached (async)', {
              documentId,
              userId,
              contentHash,
              bulletsCount: dealPoints.bullets.length,
              citationsCount: dealPoints.citations.length,
              source: 'async_extraction',
              requestId: requestId
            })
          } else {
            structuredLog('info', 'Deal points extraction returned null (async)', {
              documentId,
              userId,
              contentHash,
              source: 'async_extraction',
              requestId: requestId
            })
          }
        } catch (extractionError) {
          structuredLog('error', 'Async deal points extraction failed', {
            documentId,
            userId,
            contentHash,
            error: extractionError instanceof Error ? extractionError.message : 'Unknown error',
            source: 'async_extraction',
            requestId: requestId
          })
          // Don't throw - this is fire-and-forget
        }
      })
      
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
        kvWrite: contextStored,
        adapter: kvStore.getAdapter(),
        status: 'ready',
        parts: 1, // Will be updated if multi-part
        requestId: requestId
      })

      const response: ProcessPdfResponse = {
        documentId, // Return server-generated ID
        title,
        pagesIndexed: parseResult.pages.length,
        processingTime,
        status: 'ready',
        ...(parseResult.pages.length >= 15 && { backgroundProcessing: true }),
        // Include adapter info for debugging
        ...(process.env.NODE_ENV === 'development' && { adapter: kvStore.getAdapter(), kvWrite: contextStored })
      }

      return res.status(200).json(response)

    } finally {
      await pdfParser.cleanup()
    }

  } catch (error) {
    const processingTime = Date.now() - startTime
    
    // Set error status if we have a documentId
    if (typeof documentId !== 'undefined') {
      await kvStore.setStatus(documentId, 'error', error instanceof Error ? error.message : 'Unknown error', 0)
    }
    
    structuredLog('error', 'PDF processing failed', {
      documentId: typeof documentId !== 'undefined' ? documentId : undefined,
      userId,
      kvWrite: false,
      adapter: kvStore.getAdapter(),
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId: requestId
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

/**
 * Strip code fences from LLM response to get clean JSON
 */
function stripCodeFences(content: string): string {
  const trimmed = content.trim()
  
  // Handle ```json ... ``` format
  if (trimmed.startsWith('```json') && trimmed.endsWith('```')) {
    return trimmed.slice(7, -3).trim()
  }
  
  // Handle ``` ... ``` format
  if (trimmed.startsWith('```') && trimmed.endsWith('```')) {
    return trimmed.slice(3, -3).trim()
  }
  
  return trimmed
}

/**
 * Safe parser for deal points with multiple fallback strategies
 */
function parseDealPointsSafe(text: string): { bullets: string[] } {
  // Always return a valid structure
  const defaultResult: { bullets: string[] } = { bullets: [] }
  
  if (!text || typeof text !== 'string') {
    return defaultResult
  }
  
  // Strategy 1: Try direct JSON parse after stripping code fences
  try {
    const cleaned = stripCodeFences(text)
    const parsed = JSON.parse(cleaned)
    
    // Validate structure
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.bullets)) {
      const validBullets: string[] = parsed.bullets
        .filter((b: any) => typeof b === 'string' && b.trim().length > 0)
        .map((b: string) => b.trim())
      
      if (validBullets.length > 0) {
        // Dedupe and return
        const uniqueBullets: string[] = [...new Set(validBullets)]
        return { bullets: uniqueBullets }
      }
    }
  } catch (e) {
    // Continue to next strategy
  }
  
  // Strategy 2: Extract first balanced {...} block
  try {
    const jsonMatch = text.match(/{[^{}]*(?:{[^{}]*}[^{}]*)*}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.bullets)) {
        const validBullets: string[] = parsed.bullets
          .filter((b: any) => typeof b === 'string' && b.trim().length > 0)
          .map((b: string) => b.trim())
        
        if (validBullets.length > 0) {
          const uniqueBullets: string[] = [...new Set(validBullets)]
          return { bullets: uniqueBullets }
        }
      }
    }
  } catch (e) {
    // Continue to next strategy
  }
  
  // Strategy 3: Fallback to markdown bullet extraction
  const bullets: string[] = []
  const lines = text.split('\n')
  
  for (const line of lines) {
    const trimmedLine = line.trim()
    
    // Match various bullet formats
    const bulletMatch = trimmedLine.match(/^[-*•●▪▫◦‣⁃]\s+(.+)$/)
    if (bulletMatch && bulletMatch[1]) {
      const bulletText = bulletMatch[1].trim()
      if (bulletText.length > 0) {
        bullets.push(bulletText)
      }
    }
    
    // Also match numbered lists
    const numberedMatch = trimmedLine.match(/^\d+[.)]\s+(.+)$/)
    if (numberedMatch && numberedMatch[1]) {
      const bulletText = numberedMatch[1].trim()
      if (bulletText.length > 0) {
        bullets.push(bulletText)
      }
    }
  }
  
  // Dedupe and return
  const uniqueBullets: string[] = [...new Set(bullets)]
  return { bullets: uniqueBullets.length > 0 ? uniqueBullets : [] }
}

/**
 * Extract deal points from document chunks for fast path caching
 */
async function extractDealPoints(chunks: any[], contentHash: string, requestId?: string) {
  try {
    const EXTRACTOR_VERSION = "2024-01-20-v2" // Bump when logic changes
    
    // First try regex-based extraction for common sections
    const dealPointSections = [
      'Investment Highlights',
      'Offering Highlights', 
      'Executive Summary',
      'Terms Summary',
      'Deal Summary',
      'Key Terms',
      'Transaction Summary'
    ]
    
    let extractedBullets: Array<{text: string, page: number}> = []
    let foundSections = 0
    
    for (const chunk of chunks) {
      const text = chunk.text || ''
      const page = chunk.page || 1
      
      // Check if chunk contains deal point sections
      for (const section of dealPointSections) {
        const sectionRegex = new RegExp(`${section}[:\\s]*`, 'gi')
        if (sectionRegex.test(text)) {
          foundSections++
          
          // Extract bullet points from this section
          const bulletRegex = /[•●▪▫◦‣⁃]\s*([^•●▪▫◦‣⁃\n]+)/g
          const dashBulletRegex = /^[-−–—]\s*([^-\n]+)/gm
          const numberedRegex = /^\d+[\.)]\s*([^\d\n]+)/gm
          
          let match
          while ((match = bulletRegex.exec(text)) !== null) {
            extractedBullets.push({ text: match[1].trim(), page })
          }
          while ((match = dashBulletRegex.exec(text)) !== null) {
            extractedBullets.push({ text: match[1].trim(), page })
          }
          while ((match = numberedRegex.exec(text)) !== null) {
            extractedBullets.push({ text: match[1].trim(), page })
          }
        }
      }
    }
    
    // If we found good sections with bullets, use them
    if (foundSections > 0 && extractedBullets.length > 0) {
      const citations = extractedBullets.map(bullet => ({
        page: bullet.page,
        text: bullet.text.substring(0, 200) // Truncate for storage
      }))
      
      return {
        bullets: extractedBullets.map(b => b.text),
        citations,
        createdAt: new Date().toISOString(),
        contentHash,
        version: 2,
        extractorVersion: EXTRACTOR_VERSION,
        source: 'regex'
      }
    }
    
    // Fallback: If no structured sections found, try AI extraction on first 6 pages
    const firstSixPages = chunks.filter(chunk => (chunk.page || 1) <= 6)
    if (firstSixPages.length === 0) return null
    
    // INPUT SIZE GUARD: Limit text to prevent 413 errors
    const combinedText = firstSixPages
      .map(chunk => chunk.text || '')
      .join('\n\n')
      .substring(0, 4000) // Reduced from 8000 to prevent 413 errors
    
    // Use fast model for extraction with Responses API
    const { createChatCompletion } = await import('@/lib/services/openai')
    const { getModelConfiguration } = await import('@/lib/config/validate-models')
    
    const modelConfig = getModelConfiguration()
    
    // Use Responses API with strict JSON schema
    const extractionPayload = {
      model: modelConfig.fast,
      input: [
        {
          role: 'system',
          content: 'Extract 3-5 key deal points from this commercial real estate document. Return ONLY a JSON object with a "bullets" array containing the most important investment highlights.'
        },
        {
          role: 'user', 
          content: `Extract key deal points:\n${combinedText.substring(0, 3500)}` // Further trim for safety
        }
      ],
      temperature: 0,
      max_output_tokens: 350,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'deal_points_v1',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['bullets'],
            properties: {
              bullets: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'string',
                  minLength: 1
                }
              }
            }
          }
        }
      }
    } as any
    
    // Generate requestId if not provided
    const dealPointRequestId = requestId || `pdf-${contentHash}-${Date.now()}`
    const extractionResult = await createChatCompletion(extractionPayload, {
      requestId: dealPointRequestId
    })
    
    if (extractionResult.content) {
      // Use safe parser with fallback strategies
      const parsed = parseDealPointsSafe(extractionResult.content)
      
      if (parsed.bullets && parsed.bullets.length > 0) {
        // Success - we have bullets
        console.log('[extractDealPoints] Deal points extraction completed with', parsed.bullets.length, 'bullets')
        
        return {
          bullets: parsed.bullets.slice(0, 10), // Limit to 10 bullets
          citations: [], // Citations will be empty for now since we're using strict JSON
          createdAt: new Date().toISOString(),
          contentHash,
          version: 2,
          extractorVersion: EXTRACTOR_VERSION,
          source: 'ai'
        }
      } else {
        console.log('[extractDealPoints] No bullets extracted from AI response')
      }
    }
    
    return null
    
  } catch (error) {
    console.error('[extractDealPoints] Error:', error)
    return null
  }
}

export default withAuth(processPdfFastHandler)