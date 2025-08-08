import { useState, useEffect, useCallback } from 'react'

interface DocumentStatus {
  id: string
  name: string
  status: 'processing' | 'completed' | 'error' | 'uploading'
  fileSize: number
  uploadedAt: string
  processedAt?: string
  extractedText?: string
  metadata: any
}

interface ProcessingInfo {
  job?: {
    status: string
    attempts: number
    maxAttempts: number
    createdAt: string
    startedAt?: string
    completedAt?: string
    errorMessage?: string
  }
  chunks: number
  tables: number
}

interface UseDocumentStatusResult {
  status: DocumentStatus | null
  processing: ProcessingInfo | null
  isLoading: boolean
  error: string | null
  refetch: () => void
}

/**
 * Hook to poll document processing status
 * Automatically polls while document is processing, stops when complete
 */
export function useDocumentStatus(documentId: string | null): UseDocumentStatusResult {
  const [status, setStatus] = useState<DocumentStatus | null>(null)
  const [processing, setProcessing] = useState<ProcessingInfo | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null)

  const fetchStatus = useCallback(async () => {
    if (!documentId) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/documents/${documentId}/status`)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      if (data.success) {
        setStatus(data.document)
        setProcessing(data.processing)

        // Stop polling if document is no longer processing
        if (data.document.status === 'completed' || data.document.status === 'error') {
          if (pollInterval) {
            clearInterval(pollInterval)
            setPollInterval(null)
          }
        }
      } else {
        throw new Error(data.error || 'Failed to fetch status')
      }
    } catch (err) {
      console.error('Error fetching document status:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
      
      // Stop polling on persistent errors
      if (pollInterval) {
        clearInterval(pollInterval)
        setPollInterval(null)
      }
    } finally {
      setIsLoading(false)
    }
  }, [documentId, pollInterval])

  const refetch = useCallback(() => {
    fetchStatus()
  }, [fetchStatus])

  // Start/stop polling based on document status
  useEffect(() => {
    if (!documentId) {
      setStatus(null)
      setProcessing(null)
      setError(null)
      return
    }

    // Initial fetch
    fetchStatus()

    // Set up polling if we don't have a status or if document is processing
    if (!status || status.status === 'processing') {
      if (!pollInterval) {
        const interval = setInterval(fetchStatus, 3000) // Poll every 3 seconds
        setPollInterval(interval)
      }
    }

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval)
        setPollInterval(null)
      }
    }
  }, [documentId, fetchStatus]) // Don't include status in deps to avoid infinite loop

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval)
      }
    }
  }, [pollInterval])

  return {
    status,
    processing,
    isLoading,
    error,
    refetch
  }
}