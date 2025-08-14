import { useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { toast } from 'sonner'

interface UseInMemoryPDFProcessorOptions {
  maxFileSize?: number      // Default: 25MB
  allowedTypes?: string[]   // Default: ['application/pdf']
  onProgress?: (fileName: string, progress: number) => void
}

interface UseInMemoryPDFProcessorResult {
  processFile: (file: File) => Promise<ProcessingResult>
  progress: number         // 0-100 (overall progress)
  isProcessing: boolean
  error: string | null
  reset: () => void
}

interface ProcessingResult {
  success: boolean
  requestId: string
  processingTimeMs: number
  document: {
    originalFilename: string
    pageCount: number
    chunkCount: number
    analysis: {
      content: string
      usage: {
        promptTokens: number
        completionTokens: number
        totalTokens: number
        estimatedCost: number
      }
      processingTime: number
    }
  }
  metrics: {
    processingTime: number
    tokenCount: number
    filteringRatio: number
  }
  meta: {
    ingestMode: string
    storedToPersistence: boolean
    limits: {
      maxSizeMB: number
      maxPages: number
    }
  }
}

// Align with server limit - use MAX_UPLOAD_MB env var
const MAX_UPLOAD_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 8)
const MAX_BYTES = MAX_UPLOAD_MB * 1024 * 1024

const DEFAULT_OPTIONS: Required<UseInMemoryPDFProcessorOptions> = {
  maxFileSize: MAX_BYTES,
  allowedTypes: ['application/pdf'],
  onProgress: (_fileName: string, _progress: number) => {} // Explicit no-op function
}

export function useInMemoryPDFProcessor(options: UseInMemoryPDFProcessorOptions = {}) {
  const [progress, setProgress] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const config = { ...DEFAULT_OPTIONS, ...options }

  const reset = useCallback(() => {
    setProgress(0)
    setIsProcessing(false)
    setError(null)
  }, [])

  const validateFile = useCallback((file: File): string | null => {
    // Check if in-memory processing is enabled - allow if explicitly enabled or in development
    const isMemoryMode = process.env.NEXT_PUBLIC_INGEST_MODE === 'memory'
    if (!isMemoryMode) {
      return 'In-memory processing is not enabled. Please use storage mode.'
    }

    // Check file type - support empty MIME type PDFs
    const isPdf = file.type === 'application/pdf' || 
                  (file.type === '' && file.name.toLowerCase().endsWith('.pdf'))
    if (!isPdf) {
      return 'Invalid file type. Only PDF files are allowed.'
    }

    // Check file size
    if (file.size > config.maxFileSize) {
      return `File exceeds ${MAX_UPLOAD_MB}MB limit`
    }

    // Check if file is empty
    if (file.size === 0) {
      return 'File is empty.'
    }

    return null
  }, [config])

  const processFile = useCallback(async (file: File): Promise<ProcessingResult> => {
    setIsProcessing(true)
    setError(null)
    setProgress(0)

    try {
      // Pre-flight client-side validation
      const validationError = validateFile(file)
      if (validationError) {
        // Show toast for file size errors and don't make API call
        if (validationError.includes('exceeds') && validationError.includes('limit')) {
          toast.error(validationError)
        }
        throw new Error(validationError)
      }

      // Get Supabase client and user session
      const { supabase } = await import('@/lib/supabase')
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.user) {
        throw new Error('Not authenticated. Please log in and try again.')
      }

      setProgress(10) // Authentication complete
      config.onProgress?.(file.name, 10)

      // Create FormData for file upload
      const formData = new FormData()
      formData.append('file', file)

      setProgress(20) // Form data prepared
      config.onProgress?.(file.name, 20)

      // Create a promise to track processing progress
      const processingPromise = new Promise<ProcessingResult>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        
        // Track upload progress (first 40% of total progress)
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const uploadProgress = Math.round((event.loaded / event.total) * 40) + 20 // 20-60%
            setProgress(uploadProgress)
            config.onProgress?.(file.name, uploadProgress)
          }
        })

        xhr.addEventListener('load', async () => {
          setProgress(60) // Upload complete, starting analysis
          config.onProgress?.(file.name, 60)
          
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText)
              
              // Simulate progress during analysis phase
              setProgress(90)
              config.onProgress?.(file.name, 90)
              
              setProgress(100)
              config.onProgress?.(file.name, 100)
              
              resolve(response)
            } catch (e) {
              console.error('Response parsing failed:', e)
              reject(new Error('Failed to parse response'))
            }
          } else {
            // Parse JSON error response for structured error handling
            let errorMessage = `Processing failed: ${xhr.status} ${xhr.statusText}`
            let shouldRetry = false
            
            try {
              const errorData = JSON.parse(xhr.responseText)
              const requestId = errorData.requestId || 'unknown'
              
              // Map specific status codes to user-friendly messages
              if (xhr.status === 413) {
                errorMessage = `File too large (exceeds ${(MAX_BYTES / 1024 / 1024).toFixed(1)}MB limit)`
              } else if (xhr.status === 415) {
                errorMessage = 'Unsupported file type (PDF required)'
              } else if (xhr.status === 422) {
                // Parse error code for specific 422 messages
                if (errorData.code === 'PDF_UNREADABLE') {
                  errorMessage = 'PDF is corrupted or password-protected'
                } else if (errorData.code === 'PDF_PARSE_TIMEOUT') {
                  errorMessage = 'PDF processing timed out'
                } else if (errorData.code === 'NO_PDF_TEXT') {
                  errorMessage = 'PDF contains no readable text'
                } else {
                  errorMessage = errorData.message || 'Document cannot be processed'
                }
              } else if (xhr.status >= 500) {
                // 5xx errors - show requestId and allow retry
                errorMessage = `Processing error (ID: ${requestId})`
                shouldRetry = true
              } else {
                errorMessage = errorData.message || errorMessage
              }
            } catch (e) {
              // Use default error message if response parsing fails
              if (xhr.status >= 500) {
                shouldRetry = true
              }
            }
            
            console.error('Processing failed:', {
              status: xhr.status,
              statusText: xhr.statusText,
              responseText: xhr.responseText,
              shouldRetry
            })
            
            const error = new Error(errorMessage)
            ;(error as any).shouldRetry = shouldRetry
            reject(error)
          }
        })

        xhr.addEventListener('error', (event) => {
          console.error('Network error during processing:', event)
          reject(new Error('Network error during processing'))
        })

        xhr.addEventListener('timeout', () => {
          console.error('Processing timeout:', {
            timeout: xhr.timeout,
            fileName: file.name
          })
          reject(new Error('Processing timeout'))
        })

        // Configure the request
        xhr.open('POST', `/api/process-pdf-memory`, true)
        xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`)
        xhr.timeout = 120000 // 2 minutes timeout for in-memory processing

        xhr.send(formData)
      })

      // Wait for processing to complete with retry logic
      const result = await processingPromise
      
      console.log('In-memory processing completed:', {
        success: result.success,
        pageCount: result.document.pageCount,
        chunkCount: result.document.chunkCount,
        processingTime: result.processingTimeMs,
        analysisAvailable: !!result.document.analysis?.content
      })

      return result

    } catch (processingError: any) {
      const errorMessage = processingError instanceof Error ? processingError.message : 'Processing failed'
      console.error('In-Memory PDF Processing Error:', {
        error: processingError,
        message: errorMessage,
        fileName: file.name,
        fileSize: file.size
      })
      setError(errorMessage)
      throw new Error(errorMessage)
    } finally {
      setIsProcessing(false)
    }
  }, [validateFile, config])

  return {
    processFile,
    progress,
    isProcessing,
    error,
    reset
  }
}