import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import formidable from 'formidable'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { withAuth, AuthenticatedRequest, apiError } from '@/lib/auth-middleware'
import { PDFValidator } from '@/lib/validation'
import { PDFParserAgent } from '@/lib/agents/pdf-parser'

export const config = {
  api: {
    bodyParser: false,
  },
}

async function uploadHandler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return apiError(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED')
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const form = formidable({
    maxFileSize: 50 * 1024 * 1024, // 50MB (increased for better PDF support)
    filter: function ({ mimetype }) {
      return mimetype ? mimetype.includes('pdf') : false
    }
  })

  try {
    const [fields, files] = await form.parse(req)
    const file = Array.isArray(files.file) ? files.file[0] : files.file

    if (!file) {
      return apiError(res, 400, 'No file uploaded', 'NO_FILE')
    }

    // Read file buffer
    const fileBuffer = fs.readFileSync(file.filepath)
    
    // Quick validation
    const quickValidation = PDFValidator.quickValidate(fileBuffer, file.originalFilename || undefined)
    if (!quickValidation.isValid) {
      return apiError(res, 400, quickValidation.error || 'Invalid PDF file', 'INVALID_PDF')
    }

    // Comprehensive PDF validation
    const validationResult = await PDFValidator.validatePDF(fileBuffer, file.originalFilename || undefined)
    
    // Block obviously problematic files
    if (!validationResult.isValid) {
      return apiError(res, 400, 'PDF validation failed', 'PDF_VALIDATION_FAILED', 
        validationResult.errors.join('; '))
    }

    // Generate unique filename
    const fileExt = file.originalFilename?.split('.').pop() || 'pdf'
    const fileName = `${req.user.id}/${uuidv4()}.${fileExt}`

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('documents')
      .upload(fileName, fileBuffer, {
        contentType: file.mimetype || 'application/pdf',
        upsert: false
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return apiError(res, 500, 'Failed to upload file', 'STORAGE_ERROR', uploadError.message)
    }

    // Initialize PDF parser for background processing
    const pdfParser = new PDFParserAgent()
    let parseResult = null
    let processingError = null

    try {
      // Parse PDF content
      parseResult = await pdfParser.parseBuffer(fileBuffer, {
        extractTables: true,
        performOCR: validationResult.metadata.isEncrypted || !validationResult.metadata.hasText,
        ocrConfidenceThreshold: 70,
        chunkSize: 1000,
        preserveFormatting: true
      })
    } catch (error) {
      console.error('PDF parsing error:', error)
      processingError = error instanceof Error ? error.message : 'Unknown parsing error'
    } finally {
      // Clean up parser resources
      await pdfParser.cleanup()
    }

    // Save document metadata to database with parsing results
    const { data: documentData, error: dbError } = await supabase
      .from('documents')
      .insert({
        user_id: req.user.id,
        name: file.originalFilename || 'Untitled Document',
        file_path: uploadData.path,
        file_size: file.size,
        file_type: file.mimetype || 'application/pdf',
        status: parseResult?.success ? 'processed' : 'uploaded',
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
      // Clean up uploaded file if database insert fails
      await supabase.storage.from('documents').remove([fileName])
      return apiError(res, 500, 'Failed to save document metadata', 'DATABASE_ERROR', dbError.message)
    }

    // Store parsed content if successful
    if (parseResult?.success && parseResult.chunks.length > 0) {
      const { error: chunksError } = await supabase
        .from('document_chunks')
        .insert(
          parseResult.chunks.map(chunk => ({
            document_id: documentData.id,
            user_id: req.user.id,
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
        // Don't fail the upload, just log the error
      }

      // Store extracted tables
      if (parseResult.tables.length > 0) {
        const { error: tablesError } = await supabase
          .from('document_tables')
          .insert(
            parseResult.tables.map(table => ({
              document_id: documentData.id,
              user_id: req.user.id,
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
          // Don't fail the upload, just log the error
        }
      }
    }

    // Clean up temp file
    fs.unlinkSync(file.filepath)

    return res.status(200).json({
      success: true,
      document: {
        id: documentData.id,
        name: documentData.name,
        size: documentData.file_size,
        type: documentData.file_type,
        status: documentData.status,
        uploadedAt: documentData.created_at,
        filePath: documentData.file_path,
        validation: {
          isValid: validationResult.isValid,
          warnings: validationResult.warnings,
          metadata: validationResult.metadata
        },
        parsing: parseResult ? {
          success: parseResult.success,
          pages: parseResult.pages.length,
          tables: parseResult.tables.length,
          chunks: parseResult.chunks.length,
          processingTime: parseResult.processingTime,
          error: parseResult.error
        } : null
      }
    })
  } catch (error) {
    console.error('Upload error:', error)
    return apiError(res, 500, 'Failed to process upload', 'UPLOAD_ERROR',
      error instanceof Error ? error.message : 'Unknown error')
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  return withAuth(req, res, uploadHandler)
}