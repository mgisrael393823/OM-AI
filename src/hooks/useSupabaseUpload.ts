import { useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// Define the Supabase bucket name
const SUPABASE_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || 'documents'

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

// Upload limits aligned with server
const MAX_BYTES = 32 * 1024 * 1024 // 32MB limit

const DEFAULT_OPTIONS: Required<UseSupabaseUploadOptions> = {
  maxFileSize: MAX_BYTES,
  allowedTypes: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
  folder: '',
  onProgress: (_fileName: string, _progress: number) => {}
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
    // Check file type - support empty MIME type PDFs
    const isPdf = file.type === 'application/pdf' || 
                  (file.type === '' && file.name.toLowerCase().endsWith('.pdf'))
    const isValidType = config.allowedTypes.includes(file.type) || isPdf
    
    if (!isValidType) {
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

      console.log('Supabase Upload: Starting signed upload', {
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type
      })

      // Step 1: Get signed upload URL from API
      setProgress(10)
      const signedResponse = await fetch('/api/storage/signed-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || 'application/pdf'
        }),
      })

      if (!signedResponse.ok) {
        const errorData = await signedResponse.json()
        throw new Error(`Failed to get upload URL: ${errorData.error || signedResponse.statusText}`)
      }

      const { path, token } = await signedResponse.json()
      console.log('Supabase Upload: Got signed URL', { path })

      setProgress(25)

      // Step 2: Upload to signed URL using service role
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .uploadToSignedUrl(path, token, file, {
          contentType: file.type || 'application/pdf',
          upsert: false
        })

      if (uploadError) {
        console.error('Supabase Upload: Signed upload failed', uploadError)
        throw new Error(`Upload failed: ${uploadError.message}`)
      }

      setProgress(50)
      console.log('Supabase Upload: Signed upload completed', uploadData.path)
      
      const fileName = path // Use the path from signed upload response

      // Verify file exists using server-side verification with byte checking
      console.log('Supabase Upload: Verifying file existence and size via server')
      
      let verificationAttempts = 0
      const maxVerificationRetries = 2 // One initial attempt + 1 retry for 404 cases
      let verificationSuccessful = false
      let verificationResult: any = null

      while (!verificationSuccessful && verificationAttempts < maxVerificationRetries) {
        verificationAttempts++
        
        // Wait before retry (only for retry attempts)
        if (verificationAttempts > 1) {
          console.log('Supabase Upload: Retrying verification after 404', {
            path: fileName,
            attempt: verificationAttempts,
            delayMs: 1000
          })
          await new Promise(resolve => setTimeout(resolve, 1000))
        }

        const verificationResponse = await fetch('/api/storage/verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            path: fileName,
            expectedBytes: file.size
          }),
        })

        if (!verificationResponse.ok) {
          const errorData = await verificationResponse.json().catch(() => ({}))
          
          if (verificationResponse.status === 404) {
            console.warn('Supabase Upload: File verification failed - not found', {
              path: fileName,
              attempt: verificationAttempts,
              maxRetries: maxVerificationRetries,
              attempts: errorData.attempts,
              totalTimeMs: errorData.totalTimeMs
            })
            
            // Only retry on 404, and only once
            if (verificationAttempts < maxVerificationRetries) {
              continue // Try again
            } else {
              throw new Error('Upload completed but file verification failed after retries. Please try uploading again.')
            }
            
          } else if (verificationResponse.status === 409) {
            console.error('Supabase Upload: File verification failed - size mismatch', {
              path: fileName,
              expectedBytes: errorData.expectedBytes,
              actualBytes: errorData.actualBytes,
              attempts: errorData.attempts,
              totalTimeMs: errorData.totalTimeMs
            })
            
            // Enhanced error message for size mismatch - no retry for this
            throw new Error('Upload verified but size mismatch. Re-upload suggested.')
            
          } else if (verificationResponse.status === 422) {
            console.error('Supabase Upload: File verification failed - invalid input', {
              path: fileName,
              details: errorData.details
            })
            
            throw new Error('File verification failed due to invalid parameters.')
            
          } else {
            const errorText = await verificationResponse.text().catch(() => 'Unknown error')
            console.error('Supabase Upload: Verification endpoint error', {
              status: verificationResponse.status,
              errorText,
              errorData
            })
            throw new Error(`File verification failed: ${verificationResponse.status} ${verificationResponse.statusText}`)
          }
        } else {
          // Success response
          verificationResult = await verificationResponse.json()
          
          // Check for new success field with backward compatibility
          const isVerificationSuccessful = verificationResult.success === true && verificationResult.exists === true
          const isLegacySuccess = !('success' in verificationResult) && verificationResult.exists === true
          
          if (isVerificationSuccessful || isLegacySuccess) {
            verificationSuccessful = true
            console.log('Supabase Upload: File existence and size verified successfully', {
              path: fileName,
              bytes: verificationResult.bytes || 'unknown',
              expectedBytes: file.size,
              attempts: verificationResult.attempts,
              totalTimeMs: verificationResult.totalTimeMs,
              verifiedAt: verificationResult.verifiedAt,
              clientAttempt: verificationAttempts
            })
          } else {
            console.error('Supabase Upload: File verification unsuccessful', {
              path: fileName,
              verificationResult
            })
            throw new Error('File verification completed but was not successful.')
          }
        }
      }

      setProgress(85) // Verification complete, now processing
      
      // Process the document via API with retry logic
      let processingResult
      let retryCount = 0
      const maxRetries = 2
      
      // Small delay before first processing attempt to avoid race conditions
      await new Promise(resolve => setTimeout(resolve, 300))
      
      while (retryCount <= maxRetries) {
        try {
          const processingResponse = await fetch('/api/process-document', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              bucket: SUPABASE_BUCKET,
              path: fileName,
              originalFilename: file.name,
              fileSize: file.size,
              contentType: file.type || 'application/pdf',
            }),
          })

          if (!processingResponse.ok) {
            // Handle 409 PENDING_UPLOAD specially (race condition retry)
            if (processingResponse.status === 409) {
              const errorData = await processingResponse.json()
              const retryAfterMs = errorData.retryAfterMs || 1500
              
              console.warn('[OM-AI] 409 PENDING_UPLOAD retry', {
                fileName: file.name,
                attempt: retryCount + 1,
                maxRetries: maxRetries,
                retryAfterMs,
                errorCode: errorData.code,
                message: errorData.message,
                timestamp: new Date().toISOString()
              })
              
              await new Promise(resolve => setTimeout(resolve, retryAfterMs))
              retryCount++
              continue
            }
            
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