import { useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

interface UseSupabaseUploadOptions {
  maxFileSize?: number      // Default: 16MB
  allowedTypes?: string[]   // Default: ['application/pdf']
  folder?: string          // Default: userId
  onProgress?: (fileName: string, progress: number) => void
}

interface UseSupabaseUploadResult {
  uploadFile: (file: File) => Promise<UploadResult>
  progress: number         // 0-100 (overall progress)
  isUploading: boolean
  error: string | null
  reset: () => void
}

interface UploadResult {
  url: string             // Public URL for file access
  path: string            // Storage path for database
  size: number            // File size in bytes
  document?: {
    id: string
    filename: string
    storage_path: string
    file_size: number
    status: 'completed' | 'processing' | 'error'
  }
}

const DEFAULT_OPTIONS: Required<UseSupabaseUploadOptions> = {
  maxFileSize: 16 * 1024 * 1024, // 16MB
  allowedTypes: ['application/pdf'],
  folder: '',
  onProgress: (_fileName: string, _progress: number) => {} // Explicit no-op function
}

export function useSupabaseUpload(options: UseSupabaseUploadOptions = {}) {
  const [progress, setProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const config = { ...DEFAULT_OPTIONS, ...options }

  const reset = useCallback(() => {
    setProgress(0)
    setIsUploading(false)
    setError(null)
  }, [])

  const validateFile = useCallback((file: File): string | null => {
    // Check file type
    if (!config.allowedTypes.includes(file.type)) {
      return `Invalid file type. Only ${config.allowedTypes.join(', ')} files are allowed.`
    }

    // Check file size
    if (file.size > config.maxFileSize) {
      const maxSizeMB = Math.round(config.maxFileSize / (1024 * 1024))
      return `File size exceeds ${maxSizeMB}MB limit.`
    }

    // Check if file is empty
    if (file.size === 0) {
      return 'File is empty.'
    }

    return null
  }, [config])

  const uploadFile = useCallback(async (file: File): Promise<UploadResult> => {
    setIsUploading(true)
    setError(null)
    setProgress(0)

    try {
      // Validate file
      const validationError = validateFile(file)
      if (validationError) {
        throw new Error(validationError)
      }

      // Get Supabase client and user session
      const { supabase } = await import('@/lib/supabase')
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.user) {
        throw new Error('Not authenticated. Please log in and try again.')
      }

      const userId = session.user.id

      // Generate unique filename
      const timestamp = Date.now()
      const fileExt = file.name.split('.').pop() || 'pdf'
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
      const fileName = `${userId}/${timestamp}-${sanitizedName}`

      console.log('Supabase Upload: Starting upload for:', fileName)

      // Create a promise to track upload progress
      const uploadPromise = new Promise<{ data: any; error: any }>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        
        // Track upload progress
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 90) // Cap at 90% for processing
            setProgress(percentComplete)
            // Call external progress callback if provided
            if (config.onProgress) {
              config.onProgress(file.name, percentComplete)
            }
          }
        })

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText)
              resolve({ data: response, error: null })
            } catch (e) {
              resolve({ data: { path: fileName }, error: null }) // Fallback for successful upload
            }
          } else {
            reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`))
          }
        })

        xhr.addEventListener('error', () => {
          reject(new Error('Network error during upload'))
        })

        xhr.addEventListener('timeout', () => {
          reject(new Error('Upload timeout'))
        })

        // Configure the request
        xhr.open('POST', `/api/supabase-upload`, true)
        xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`)
        xhr.timeout = 300000 // 5 minutes timeout

        // Create FormData
        const formData = new FormData()
        formData.append('file', file)
        formData.append('fileName', fileName)

        xhr.send(formData)
      })

      // Wait for upload to complete
      const { data: uploadData, error: uploadError } = await uploadPromise

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`)
      }

      console.log('Supabase Upload: File uploaded successfully:', fileName)
      setProgress(95) // Upload complete, now processing

      console.log('Supabase Upload: Starting document processing')
      
      // Process the document via API
      const processingResponse = await fetch('/api/process-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          fileName,
          originalFileName: file.name,
          fileSize: file.size,
          userId,
        }),
      })

      if (!processingResponse.ok) {
        throw new Error(`Document processing failed: ${processingResponse.statusText}`)
      }

      const processingResult = await processingResponse.json()

      if (!processingResult.success) {
        throw new Error(processingResult.error || 'Document processing failed')
      }

      setProgress(100)
      // Notify external progress callback of completion
      if (config.onProgress) {
        config.onProgress(file.name, 100)
      }
      console.log('Supabase Upload: Document processing completed')

      // Get public URL for the file
      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(fileName)

      return {
        url: urlData.publicUrl,
        path: fileName,
        size: file.size,
        document: processingResult.document
      }

    } catch (uploadError) {
      const errorMessage = uploadError instanceof Error ? uploadError.message : 'Upload failed'
      console.error('Supabase Upload Error:', uploadError)
      setError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      setIsUploading(false)
    }
  }, [validateFile])

  return {
    uploadFile,
    progress,
    isUploading,
    error,
    reset
  }
}