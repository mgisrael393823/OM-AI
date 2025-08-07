import { createClient } from '@supabase/supabase-js'
import { PDFValidator } from '@/lib/validation'
import { PDFParserAgent } from '@/lib/agents/pdf-parser'
import type { Database } from '@/types/database'

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
    
    // Validate environment variables
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Document processor: Missing required Supabase environment variables")
      throw new Error("Missing required Supabase environment variables")
    }
    
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

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
      parseResult = await pdfParser.parseBuffer(fileBuffer, {
        extractTables: true,
        performOCR: validationResult.metadata.isEncrypted || !validationResult.metadata.hasText,
        ocrConfidenceThreshold: 70,
        chunkSize: 4000,
        preserveFormatting: true
      })
    } catch (error) {
      console.error('PDF parsing error:', error)
      processingError = error instanceof Error ? error.message : 'Unknown parsing error'
    } finally {
      await pdfParser.cleanup()
    }

    // Save document metadata to database
    const { data: documentData, error: dbError } = await supabase
      .from('documents')
      .insert({
        user_id: userId,
        filename: fileName,
        original_filename: originalFileName,
        storage_path: storagePath,
        file_size: fileSize,
        file_type: 'application/pdf',
        status: parseResult?.success ? 'completed' : 'processing',
        metadata: {
          validation: validationResult,
          parsing: parseResult ? {
            success: parseResult.success,
            pages: parseResult.pages.length,
            tables: parseResult.tables.length,
            chunks: parseResult.chunks.length,
            processingTime: parseResult.processingTime,
            error: parseResult.error
          } : null,
          processingError
        }
      })
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
      const { error: chunksError } = await supabase
        .from('document_chunks')
        .insert(
          parseResult.chunks.map(chunk => ({
            document_id: documentData.id,
            user_id: userId,
            chunk_id: chunk.id,
            content: chunk.text,
            page_number: chunk.page,
            chunk_type: chunk.type,
            tokens: chunk.tokens,
            metadata: {
              startY: chunk.startY,
              endY: chunk.endY
            }
          }))
        )

      if (chunksError) {
        console.error('Failed to store document chunks:', chunksError)
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
              table_data: table.rows,
              headers: table.headers,
              position: {
                x: table.x,
                y: table.y,
                width: table.width,
                height: table.height
              }
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