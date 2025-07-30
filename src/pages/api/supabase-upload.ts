import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { withAuth, AuthenticatedRequest } from '@/lib/auth-middleware'
import { createApiError, ERROR_CODES } from '@/lib/constants/errors'
import { getConfig } from '@/lib/config'
import formidable from 'formidable'
import { readFileSync } from 'fs'
import { v4 as uuidv4 } from 'uuid'
import type { Database } from '@/types/database'

// Disable default body parser to handle multipart/form-data
export const config = {
  api: {
    bodyParser: false,
  },
}

async function supabaseUploadHandler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return createApiError(res, ERROR_CODES.METHOD_NOT_ALLOWED)
  }

  try {
    // Parse the multipart form data
    const form = formidable({
      maxFileSize: 16 * 1024 * 1024, // 16MB limit
      keepExtensions: true,
      filter: ({ mimetype }) => {
        // Only allow PDF files
        return mimetype === 'application/pdf'
      }
    })

    const [fields, files] = await form.parse(req)
    
    // Extract the uploaded file
    const uploadedFile = Array.isArray(files.file) ? files.file[0] : files.file

    if (!uploadedFile) {
      return createApiError(res, ERROR_CODES.NO_FILE)
    }

    // Generate secure filename with fixed .pdf extension to prevent path traversal
    const fileName = `${req.user.id}/${uuidv4()}.pdf`

    // Validate file type
    if (uploadedFile.mimetype !== 'application/pdf') {
      return createApiError(res, ERROR_CODES.INVALID_FILE_TYPE)
    }

    // Read the file buffer
    const fileBuffer = readFileSync(uploadedFile.filepath)

    // Initialize Supabase client
    const config = getConfig()
    const supabase = createClient<Database>(
      config.supabase.url,
      config.supabase.serviceRoleKey
    )

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('documents')
      .upload(fileName, fileBuffer, {
        contentType: 'application/pdf',
        upsert: false
      })

    if (uploadError) {
      console.error('Supabase storage upload error:', uploadError)
      return createApiError(res, ERROR_CODES.STORAGE_ERROR, `Storage upload failed: ${uploadError.message}`)
    }

    console.log('Supabase Upload API: File uploaded successfully:', fileName)

    // Return success response
    res.status(200).json({
      success: true,
      path: uploadData.path,
      fileName: fileName
    })

  } catch (error) {
    console.error('Supabase upload API error:', error)
    
    if (error instanceof Error) {
      if (error.message.includes('File size limit')) {
        return createApiError(res, ERROR_CODES.FILE_TOO_LARGE, 'File too large. Maximum size is 16MB.')
      }
      if (error.message.includes('Invalid file type')) {
        return createApiError(res, ERROR_CODES.INVALID_FILE_TYPE, 'Invalid file type. Only PDF files are allowed.')
      }
    }
    
    return createApiError(
      res,
      ERROR_CODES.UPLOAD_ERROR,
      error instanceof Error ? error.message : 'Unknown error'
    )
  }
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return withAuth(req, res, supabaseUploadHandler)
}