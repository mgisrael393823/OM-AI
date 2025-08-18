import { useState, useCallback } from 'react'
import { upload } from '@vercel/blob/client'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'

interface UseDirectUploadOptions {
  onProgress?: (fileName: string, progress: number) => void
  onUploadComplete?: (result: any) => void
}

interface UseDirectUploadResult {
  uploadFile: (file: File) => Promise<any>
  progress: number
  isUploading: boolean
  error: string | null
  reset: () => void
}

interface ProcessResult {
  documentId: string  // Changed from docId to documentId for consistency
  title: string
  pagesIndexed: number
  processingTime: number
  status: 'ready' | 'processing' | 'error'
  backgroundProcessing?: boolean
}

export function useDirectUpload(options: UseDirectUploadOptions = {}): UseDirectUploadResult {
  const [progress, setProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { session } = useAuth()

  const { onProgress, onUploadComplete } = options

  const reset = useCallback(() => {
    setProgress(0)
    setIsUploading(false)
    setError(null)
  }, [])

  const uploadFile = useCallback(async (file: File): Promise<ProcessResult> => {
    setIsUploading(true)
    setError(null)
    setProgress(0)

    try {
      // Validate file
      if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
        throw new Error('Only PDF files are supported')
      }

      // Size limit check (25MB for fast processing)
      const MAX_SIZE = 25 * 1024 * 1024
      if (file.size > MAX_SIZE) {
        throw new Error(`File size exceeds ${MAX_SIZE / 1024 / 1024}MB limit`)
      }

      console.log('[DirectUpload] Starting upload for:', file.name, 'Size:', file.size)

      // Step 1: Direct upload to Vercel Blob (0% to 70% progress)
      setProgress(5)
      onProgress?.(file.name, 5)

      // Direct client upload with Edge handler
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/blob/upload',
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded / progressEvent.total) * 70)
          setProgress(percentCompleted)
          onProgress?.(file.name, percentCompleted)
        }
      })

      console.log('[DirectUpload] Upload completed:', blob.pathname, blob.url)

      // Upload complete
      setProgress(70)
      onProgress?.(file.name, 70)

      // Step 2: Fast processing (70% to 90%)
      setProgress(75)
      onProgress?.(file.name, 75)

      // Get auth token for authenticated request
      const token = session?.access_token

      const processResponse = await fetch('/api/process-pdf-fast', {
        method: 'POST',
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ 
          file_key: blob.pathname,
          file_url: blob.url
        })
      })

      if (!processResponse.ok) {
        const error = await processResponse.json()
        
        // Handle specific error codes
        if (processResponse.status === 503) {
          throw new Error('Upload service temporarily unavailable. Please try again later.')
        }
        
        throw new Error(error.message || error.error || 'Processing failed')
      }

      const result: ProcessResult = await processResponse.json()
      console.log('[DirectUpload] Processing completed:', result)

      // Complete
      setProgress(100)
      onProgress?.(file.name, 100)

      // Show success message
      const timeStr = result.processingTime < 1000 ? 
        `${result.processingTime}ms` : 
        `${(result.processingTime / 1000).toFixed(1)}s`
        
      toast.success(
        `Document processed in ${timeStr}${result.backgroundProcessing ? ' (continuing in background)' : ''}`
      )

      // Store server-generated document ID for chat context
      // IMPORTANT: Use exact documentId from server, do not modify
      try {
        sessionStorage.setItem('activeDocId', result.documentId)
        console.log('[DirectUpload] Stored server documentId:', result.documentId)
      } catch (error) {
        console.warn('[DirectUpload] Failed to store documentId in sessionStorage:', error)
      }

      onUploadComplete?.(result)
      return result

    } catch (uploadError: any) {
      const errorMessage = uploadError instanceof Error ? uploadError.message : 'Upload failed'
      console.error('[DirectUpload] Error:', uploadError)
      setError(errorMessage)
      toast.error(errorMessage)
      throw new Error(errorMessage)
    } finally {
      setIsUploading(false)
    }
  }, [onProgress, onUploadComplete, session])

  return {
    uploadFile,
    progress,
    isUploading,
    error,
    reset
  }
}