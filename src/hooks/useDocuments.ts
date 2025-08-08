import { useState, useEffect, useCallback } from 'react'

interface Document {
  id: string
  name: string
  filename: string
  size: number
  status: 'uploading' | 'processing' | 'completed' | 'error'
  uploadedAt: string
  processedAt?: string
  metadata: any
}

interface UseDocumentsResult {
  documents: Document[]
  isLoading: boolean
  error: string | null
  deleteDocument: (id: string) => Promise<boolean>
  refreshDocuments: () => void
}

/**
 * Hook for managing user documents with CRUD operations
 */
export function useDocuments(): UseDocumentsResult {
  const [documents, setDocuments] = useState<Document[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/documents')
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      if (data.success) {
        setDocuments(data.documents || [])
      } else {
        throw new Error(data.error || 'Failed to fetch documents')
      }
    } catch (err) {
      console.error('Error fetching documents:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
      setDocuments([]) // Clear documents on error
    } finally {
      setIsLoading(false)
    }
  }, [])

  const deleteDocument = useCallback(async (documentId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      if (data.success) {
        // Remove the deleted document from state immediately
        setDocuments(prevDocs => prevDocs.filter(doc => doc.id !== documentId))
        return true
      } else {
        throw new Error(data.error || 'Failed to delete document')
      }
    } catch (err) {
      console.error('Error deleting document:', err)
      setError(err instanceof Error ? err.message : 'Failed to delete document')
      return false
    }
  }, [])

  const refreshDocuments = useCallback(() => {
    fetchDocuments()
  }, [fetchDocuments])

  // Fetch documents on mount
  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  return {
    documents,
    isLoading,
    error,
    deleteDocument,
    refreshDocuments
  }
}