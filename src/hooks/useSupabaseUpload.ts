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
              console.warn('Supabase Upload: Response parsing failed, using fallback', e)
              resolve({ data: { path: fileName }, error: null }) // Fallback for successful upload
            }
          } else {
            const errorMsg = `Upload failed: ${xhr.status} ${xhr.statusText}`
            console.error('Supabase Upload: Upload failed', {
              status: xhr.status,
              statusText: xhr.statusText,
              responseText: xhr.responseText
            })
            reject(new Error(errorMsg))
          }
        })

        xhr.addEventListener('error', (event) => {
          console.error('Supabase Upload: Network error during upload', event)
          reject(new Error('Network error during upload'))
        })

        xhr.addEventListener('timeout', () => {
          console.error('Supabase Upload: Upload timeout', {
            timeout: xhr.timeout,
            fileName
          })
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

      setProgress(95) // Upload complete, now processing
      
      // Process the document via API with retry logic
      let processingResult
      let retryCount = 0
      const maxRetries = 2
      
      while (retryCount <= maxRetries) {
        try {
          const processingResponse = await fetch('/api/process-document', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              fileName: uploadData.fileName || uploadData.path || fileName,
              originalFileName: file.name,
              fileSize: file.size,
              userId,
            }),
          })


          if (!processingResponse.ok) {
            // Don't retry on 422 (unprocessable content)
            if (processingResponse.status === 422) {
              const errorData = await processingResponse.json();
              const errorMessage = errorData.message || 'Document cannot be processed (likely image-only PDF)';
              console.error('Supabase Upload: Unprocessable content', { errorData });
              const e = new Error(`422: ${errorMessage}`);
              (e as any).status = 422;
              (e as any).code = 'UNPROCESSABLE';
              throw e;
            }
            
            const errorText = await processingResponse.text()
            console.error('Supabase Upload: Processing response not ok', {
              status: processingResponse.status,
              errorText,
              retryCount
            })
            throw new Error(`Document processing failed: ${processingResponse.status} ${processingResponse.statusText} - ${errorText}`)
          }

          processingResult = await processingResponse.json()

          if (!processingResult.success) {
            throw new Error(processingResult.error || 'Document processing failed')
          }
          
          // Success - break out of retry loop
          break
          
        } catch (error) {
          // Don't retry on 422 errors
          const status = (error as any)?.status;
          if (status === 422 || (error instanceof Error && error.message.startsWith('422:'))) {
            throw error; // abort retries
          }
          
          retryCount++
          const isLastRetry = retryCount > maxRetries
          
          console.error(`Supabase Upload: Processing attempt ${retryCount} failed`, {
            error: error instanceof Error ? error.message : error,
            isLastRetry,
            fileName
          })
          
          if (isLastRetry) {
            // Final attempt failed, re-throw the error
            throw error
          }
          
          // Wait before retry (exponential backoff)
          const waitTime = Math.pow(2, retryCount) * 1000 // 2s, 4s
          await new Promise(resolve => setTimeout(resolve, waitTime))
        }
      }

      setProgress(100)
      // Notify external progress callback of completion
      if (config.onProgress) {
        config.onProgress(file.name, 100)
      }

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