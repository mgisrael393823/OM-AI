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

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Upload API missing env vars:', {
      hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
    })
    return apiError(res, 500, 'Server configuration error', 'CONFIG_ERROR')
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
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

    // Generate unique filename with fixed .pdf extension to prevent path traversal
    const fileName = `${req.user.id}/${uuidv4()}.pdf`

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

    // ASYNC PROCESSING: Don't parse PDF synchronously anymore
    // Instead, we'll enqueue a background job after saving the document

    // Save document metadata to database with parsing results
    const { data: documentData, error: dbError } = await supabase
      .from('documents')
      .insert({
        user_id: req.user.id,
        filename: fileName, // Generated unique filename
        original_filename: file.originalFilename || 'Untitled Document',
        storage_path: uploadData.path,
        file_size: file.size,
        file_type: file.mimetype || 'application/pdf',
        status: 'processing', // Always start as processing since we do it async
        metadata: {
          validation: validationResult,
          parsing: null, // Will be filled in by background job
          processingError: null
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

    // Enqueue background processing job
    const { error: jobError } = await supabase.rpc('enqueue_processing_job', {
      p_document_id: documentData.id,
      p_user_id: req.user.id,
      p_job_type: 'pdf_processing'
    })

    if (jobError) {
      console.error('Failed to enqueue processing job:', jobError)
      // Don't fail the upload, just log the error - the document can be processed later
    }

    // Clean up temp file
    fs.unlinkSync(file.filepath)

    return res.status(200).json({
      success: true,
      document: {
        id: documentData.id,
        name: documentData.original_filename,
        filename: documentData.filename,
        size: documentData.file_size,
        type: documentData.file_type,
        status: documentData.status,
        uploadedAt: documentData.created_at,
        storagePath: documentData.storage_path,
        validation: {
          isValid: validationResult.isValid,
          warnings: validationResult.warnings,
          metadata: validationResult.metadata
        },
        parsing: {
          success: null, // Will be updated when processing completes
          status: 'processing', // Indicate async processing in progress
          enqueuedAt: new Date().toISOString()
        }
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