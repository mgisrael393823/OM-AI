import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { PDFValidator } from '@/lib/validation'
import { PDFParserAgent } from '@/lib/agents/pdf-parser'
import { openAIService } from '@/lib/services/openai'
import { transientStore } from '@/lib/transient-store'
import type { Database } from '@/types/database'

type DocInsert = Database["public"]["Tables"]["documents"]["Insert"]

type JsonValue = string | number | boolean | null | { [k: string]: JsonValue } | JsonValue[]

function toJson(value: unknown): JsonValue {
  const seen = new WeakSet()
  const out = JSON.stringify(value, (_k, v) => {
    if (typeof v === "bigint") return v.toString()
    if (v instanceof Date) return v.toISOString()
    if (typeof v === "function" || v === undefined) return undefined
    if (typeof v === "object" && v !== null) {
      if (seen.has(v as object)) return undefined
      seen.add(v as object)
    }
    return v
  })
  return out ? (JSON.parse(out) as JsonValue) : null
}

export interface ProcessDocumentResult {
  success: boolean
  document?: {
    id: string
    filename: string
    storage_path: string
    file_size: number
    status: 'completed' | 'processing' | 'error'
  }
  error?: string
}

export interface InMemoryProcessResult {
  success: boolean
  pageCount?: number
  chunkCount?: number
  analysis?: any
  metrics?: any
  stored?: boolean
  requestId?: string
  error?: string
}

export interface InMemoryProcessParams {
  buffer: Buffer
  originalFilename: string
  userId: string
  requestId: string
  maxPages?: number
  storeAnalysis?: boolean
  useCanvas?: boolean
}

/**
 * Process an uploaded PDF document
 * Extracted from UploadThing onUploadComplete logic
 */
export async function processUploadedDocument(
  fileBuffer: Buffer,
  fileName: string,
  originalFileName: string,
  storagePath: string,
  fileSize: number,
  userId: string
): Promise<ProcessDocumentResult> {
  const startTime = Date.now()
  
  try {
    console.log("Document processor: Starting processing for:", originalFileName)
    
    // Use admin client to bypass RLS policies
    const supabase = getSupabaseAdmin()

    // Validate PDF
    console.log("Document processor: Starting PDF validation")
    const quickValidation = PDFValidator.quickValidate(fileBuffer, originalFileName)
    if (!quickValidation.isValid) {
      throw new Error(quickValidation.error || 'Invalid PDF file')
    }

    const validationResult = await PDFValidator.validatePDF(fileBuffer, originalFileName)
    if (!validationResult.isValid) {
      throw new Error(`PDF validation failed: ${validationResult.errors.join('; ')}`)
    }

    // Initialize PDF parser
    const pdfParser = new PDFParserAgent()
    let parseResult = null
    let processingError = null

    try {
      // Check actual canvas availability for uploads
      const requestedCanvas = process.env.USE_CANVAS !== 'false'
      const USE_CANVAS = process.env.USE_CANVAS === 'true'
      const actualCanvasUse = requestedCanvas && USE_CANVAS
      
      parseResult = await pdfParser.parseBuffer(fileBuffer, {
        extractTables: actualCanvasUse,
        performOCR: actualCanvasUse && (validationResult.metadata.isEncrypted || !validationResult.metadata.hasText),
        ocrConfidenceThreshold: 70,
        chunkSize: 4000,
        preserveFormatting: true,
        useCanvas: actualCanvasUse
      })
      
      // Validate immediately after parsing
      if (!parseResult?.success) {
        const err: any = new Error(parseResult?.error || 'PDF parsing failed')
        err.code = 'PARSE_FAILED'
        throw err
      }
      
      if (!parseResult.fullText?.trim()) {
        const err: any = new Error('No extractable text in PDF')
        err.code = 'NO_PDF_TEXT'
        throw err
      }
      
      if (!parseResult.chunks || parseResult.chunks.length === 0) {
        const err: any = new Error('Document produced no chunks')
        err.code = 'NO_CHUNKS'
        throw err
      }
    } catch (error) {
      await pdfParser.cleanup()
      // Re-throw to bubble up
      throw error
    } finally {
      await pdfParser.cleanup()
    }

    // Save document metadata to database
    const safeMetadata = toJson({
      validation: validationResult,
      parsing: parseResult ? {
        success: parseResult.success,
        pages: parseResult.pages.length,
        tables: parseResult.tables.length,
        chunks: parseResult.chunks.length,
        processingTime: parseResult.processingTime,
        error: parseResult.error
      } : null,
      processingError: processingError ?? null
    })

    // Optional: trim oversized metadata (>200KB)
    const metaStr = JSON.stringify(safeMetadata)
    const metadata = metaStr && Buffer.byteLength(metaStr, "utf8") > 200_000
      ? toJson({ 
          validation: { isValid: validationResult?.isValid ?? null }, 
          parsing: null, 
          processingError: processingError ?? null 
        })
      : safeMetadata

    const payload: DocInsert = {
      user_id: userId,
      filename: fileName,
      original_filename: originalFileName,
      storage_path: storagePath,
      file_size: fileSize,
      file_type: 'application/pdf',
      status: parseResult?.success ? 'completed' : 'processing',
      extracted_text: null,
      metadata
    }

    const { data: documentData, error: dbError } = await supabase
      .from('documents')
      .insert(payload)
      .select()
      .single()
    
    if (dbError) {
      console.error('Database error:', dbError)
      // Try to clean up uploaded file
      await supabase.storage.from('documents').remove([fileName])
      throw new Error(`Failed to save document metadata: ${dbError.message}`)
    }

    // Store parsed chunks if successful
    if (parseResult?.success && parseResult.chunks.length > 0) {
      const VALID_CHUNK_TYPES = ['paragraph', 'table', 'header', 'footer', 'list'] as const
      const validChunks = parseResult.chunks
        .filter(c => Boolean(c.content || c.text) && (c.page_number !== undefined || c.page !== undefined))
        .map((c, idx) => ({
          document_id: documentData.id,
          user_id: userId,
          chunk_id: c.id,
          content: (c.content || c.text) as string,
          page_number: (c.page_number ?? c.page) as number,
          chunk_index: c.chunk_index ?? idx,
          // Ensure chunk_type matches database constraint
          chunk_type: VALID_CHUNK_TYPES.includes((c.type as any)) ? c.type : 'paragraph',
          tokens: c.tokens || 0,
          metadata: toJson({
            startY: c.startY,
            endY: c.endY
          }) as Database["public"]["Tables"]["document_chunks"]["Insert"]["metadata"]
        }))

      if (validChunks.length > 0) {
        console.log('[DEBUG] chunk row keys:', Object.keys(validChunks[0]));
        console.log('[DEBUG] sample chunk:', validChunks[0]);

        const { error: chunksError } = await supabase
          .from('document_chunks')
          .insert(validChunks)

        if (chunksError) {
          console.error('Failed to store document chunks:', chunksError)
          throw new Error(`Failed to store document chunks: ${chunksError.message}`)
        }
      }

      // Store extracted tables
      if (parseResult.tables.length > 0) {
        const { error: tablesError } = await supabase
          .from('document_tables')
          .insert(
            parseResult.tables.map(table => ({
              document_id: documentData.id,
              user_id: userId,
              page_number: table.page,
              table_data: toJson(table.rows),
              headers: toJson(table.headers),
              position: toJson({
                x: table.x,
                y: table.y,
                width: table.width,
                height: table.height
              })
            }))
          )

        if (tablesError) {
          console.error('Failed to store document tables:', tablesError)
        }
      }
    }

    console.log("Document processor: Successfully processed document:", documentData.id)
    
    const executionTime = Date.now() - startTime
    console.log(`Document processor: Execution time: ${executionTime}ms`)
    
    return {
      success: true,
      document: {
        id: documentData.id,
        filename: documentData.filename,
        storage_path: documentData.storage_path,
        file_size: documentData.file_size,
        status: documentData.status as 'completed' | 'processing' | 'error'
      }
    }
  } catch (error) {
    // Log error details
    console.error("Document processor error:", {
      error,
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      userId,
      fileName: originalFileName
    })
    
    const executionTime = Date.now() - startTime
    console.log(`Document processor: Execution time (failed): ${executionTime}ms`)
    
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown processing error"
    }
  }
}

/**
 * Process PDF entirely in memory without persistent storage
 * Optimized for speed and immediate analysis
 */
export async function processInMemory(
  buffer: Buffer,
  opts: { userId: string; originalFilename: string; useCanvas?: boolean }
) {
  const { userId, useCanvas = false } = opts
  const safeOriginalFilename = 
    (opts as any)?.originalFilename ||
    (opts as any)?.name ||
    'upload.pdf'

  const fileBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  
  // Enhanced canvas usage logging
  const USE_CANVAS = process.env.USE_CANVAS === 'true'
  let canvasStatus: any = { available: false, reason: 'Canvas disabled via USE_CANVAS environment variable' }
  
  if (USE_CANVAS) {
    try {
      const { getCanvasStatus, isCanvasAvailable } = await import('@/lib/canvas-loader')
      canvasStatus = getCanvasStatus()
      const actualCanvasUse = useCanvas && isCanvasAvailable()
    } catch (error) {
      console.warn('[document-processor] Failed to load canvas loader:', error)
      canvasStatus = { available: false, reason: 'Canvas loader failed to import' }
    }
  } else {
    console.log('[document-processor] Canvas disabled, using text-only processing')
  }
  
  const actualCanvasUse = useCanvas && USE_CANVAS
  
  // Suppress font warnings in text-only mode
  let originalWarn: typeof console.warn | undefined
  if (!actualCanvasUse) {
    originalWarn = console.warn
    const warnFilter = /TT:|font|glyph|CMap|undefined function/i
    console.warn = (...args) => {
      const msg = args.join(' ')
      if (!warnFilter.test(msg)) {
        originalWarn!.apply(console, args)
      }
    }
  }
  
  if (process.env.NODE_ENV === 'development') {
    console.log('[processInMemory] Canvas usage:', {
      requested: useCanvas,
      environmentEnabled: canvasStatus.enabled,
      actuallyUsing: actualCanvasUse,
      status: actualCanvasUse ? 'enabled' : 'disabled (text-only)',
      reason: !useCanvas ? 'disabled by parameter' : 
              !canvasStatus.enabled ? 'USE_CANVAS=false' :
              !actualCanvasUse ? 'canvas package unavailable' : 'enabled'
    })
  } else {
    // Production: simpler logging
    console.log('[processInMemory] Processing mode:', actualCanvasUse ? 'enhanced (with canvas)' : 'text-only (optimized)')
  }
  
  // Quick validation
  const quickValidation = PDFValidator.quickValidate(fileBuffer, safeOriginalFilename)
  if (!quickValidation.isValid) {
    throw new Error(quickValidation.error || 'Invalid PDF file')
  }

  const validationResult = await PDFValidator.validatePDF(fileBuffer, safeOriginalFilename)
  if (!validationResult.isValid) {
    throw new Error(`PDF validation failed: ${validationResult.errors.join('; ')}`)
  }

  // Check page count limit
  const estimatedPages = validationResult.metadata.pageCount || 1
  const pageLimit = Number(process.env.DOC_MAX_PAGES || '80')
  if (estimatedPages > pageLimit) {
    throw new Error(`Document has ${estimatedPages} pages, exceeds limit of ${pageLimit}`)
  }

  // Initialize PDF parser
  const pdfParser = new PDFParserAgent()
  let parseResult = null

  try {
    parseResult = await pdfParser.parseBuffer(fileBuffer, {
      extractTables: actualCanvasUse, // Only extract tables if canvas is actually available
      performOCR: actualCanvasUse && (validationResult.metadata.isEncrypted || !validationResult.metadata.hasText),
      ocrConfidenceThreshold: 70,
      chunkSize: 4000,
      preserveFormatting: true,
      maxPages: pageLimit,
      useCanvas: actualCanvasUse // Pass actual canvas availability to parser
    })
    
    if (!parseResult?.success) {
      throw new Error(parseResult?.error || 'PDF parsing failed')
    }
    
    if (!parseResult.fullText?.trim()) {
      throw new Error('No extractable text in PDF')
    }
    
    if (!parseResult.chunks || parseResult.chunks.length === 0) {
      throw new Error('Document produced no chunks')
    }

  } catch (error) {
    await pdfParser.cleanup()
    // Restore console.warn before throwing
    if (originalWarn) {
      console.warn = originalWarn
    }
    throw error
  } finally {
    await pdfParser.cleanup()
  }

  // your existing heuristic filter
  const chunksForAnalysis = filterFinancialContent(parseResult.chunks)

  let analysis = ''
  try {
    const { getModelConfiguration } = await import('@/lib/config/validate-models')
    const modelConfig = getModelConfiguration()
    const analysisResult = await analyzeWithOpenAI({
      chunks: chunksForAnalysis,
      model: modelConfig.main
    });
    analysis = analysisResult.content || '[WARN] Analysis not available';
  } catch (e: any) {
    analysis = `[WARN] OpenAI analysis unavailable: ${e?.message || 'unknown error'}`
  }

  // Store chunks in transient store for retrieval
  const requestId = `mem-${Date.now().toString(36)}`
  
  // Transform chunks to TransientChunk format
  const transientChunks = parseResult.chunks.map((chunk, index) => ({
    id: chunk.id || `chunk-${index}`,
    text: chunk.content || chunk.text || '',
    page: chunk.page_number ?? chunk.page ?? null,
    chunk_index: chunk.chunk_index ?? index,
    metadata: {
      originalFilename: safeOriginalFilename,
      type: chunk.type || 'text',
      tokens: chunk.tokens || 0
    }
  }))

  // Store chunks in transient store with 15-minute TTL
  transientStore.setChunks(requestId, transientChunks)

  // Restore original console.warn if it was suppressed
  if (originalWarn) {
    console.warn = originalWarn
  }

  console.log(`[processInMemory] Stored ${transientChunks.length} chunks for ${requestId}`)

  return {
    requestId,
    document: {
      originalFilename: safeOriginalFilename,
      pageCount: parseResult.pages.length,
      chunkCount: parseResult.chunks.length,
      analysis
    },
    metadata: {
      originalFilename: safeOriginalFilename,
      pageCount: parseResult.pages.length,
      chunkCount: parseResult.chunks.length,
      userId
    }
  }
}

/**
 * Filter chunks to focus on financial and table content
 */
function filterFinancialContent(chunks: any[]): any[] {
  const financialKeywords = [
    'income', 'revenue', 'expense', 'profit', 'loss', 'cash flow', 'noi',
    'cap rate', 'irr', 'npv', 'debt', 'equity', 'mortgage', 'loan',
    'lease', 'rent', 'occupancy', 'vacancy', 'market', 'value',
    'appraisal', 'assessment', 'tax', 'insurance', 'maintenance',
    'utilities', 'management', 'fees', 'commission', 'closing',
    'acquisition', 'disposition', 'refinancing', '$', '%'
  ]
  
  return chunks.filter(chunk => {
    const content = (chunk.content || chunk.text || '').toLowerCase()
    
    // Include if contains financial keywords
    const hasFinancialContent = financialKeywords.some(keyword => 
      content.includes(keyword)
    )
    
    // Include if appears to be tabular data (contains multiple numbers)
    const numberMatches = content.match(/\d+/g) || []
    const hasTabularData = numberMatches.length >= 3
    
    // Include if chunk type indicates structured data
    const isStructuredData = chunk.type === 'table' || chunk.type === 'financial'
    
    return hasFinancialContent || hasTabularData || isStructuredData
  })
}

/**
 * Analyze filtered content with OpenAI
 */
function toStructured(resp: any) {
  const content = resp?.content ?? (typeof resp === 'string' ? resp : '');
  return {
    content,
    usage: resp?.usage ?? null,
    metadata: resp?.metadata ?? null
  };
}

async function analyzeWithOpenAI(input: { chunks: any[]; model?: string }) {
  const { getModelConfiguration } = await import('@/lib/config/validate-models')
  const modelConfig = getModelConfiguration()
  const model = input.model || modelConfig.main;
  
  // Prepare context from chunks
  const context = input.chunks.map((chunk, idx) => 
    `[Chunk ${idx + 1}]\n${chunk.content || chunk.text || ''}`
  ).join('\n\n')

  const resp = await openAIService.createChatCompletion({
    model,
    messages: [
      { role: 'system', content: 'You are a financial extraction agent.' },
      { role: 'user', content: context }
    ],
    max_output_tokens: 2000
  });

  return toStructured(resp);
}

/**
 * Store minimal analysis results (optional)
 */
async function storeAnalysisResults(data: {
  userId: string
  filename: string
  pageCount: number
  analysis: any
  metrics: any
}): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin()

    const { error } = await supabase
      .from('usage_logs')
      .insert({
        user_id: data.userId,
        action: 'document_analysis',
        metadata: {
          filename: data.filename,
          page_count: data.pageCount,
          analysis_result: data.analysis,
          metrics: data.metrics
        }
      })

    if (error) {
      console.error('Failed to store analysis results:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Error storing analysis results:', error)
    return false
  }
}

/**
 * Merge two analysis results, preferring non-empty fields from the first
 */
function mergeAnalyses(a: any, b: any): any {
  if (!a && !b) return null
  if (!a) return b
  if (!b) return a
  
  return {
    ...b,
    ...a,
    metrics: {
      ...(b?.metrics || {}),
      ...(a?.metrics || {})
    },
    usage: {
      ...(b?.usage || {}),
      ...(a?.usage || {}),
      promptTokens: (a?.usage?.promptTokens || 0) + (b?.usage?.promptTokens || 0),
      completionTokens: (a?.usage?.completionTokens || 0) + (b?.usage?.completionTokens || 0),
      totalTokens: (a?.usage?.totalTokens || 0) + (b?.usage?.totalTokens || 0),
      estimatedCost: (a?.usage?.estimatedCost || 0) + (b?.usage?.estimatedCost || 0)
    }
  }
}