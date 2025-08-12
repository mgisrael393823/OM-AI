import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

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

  const { session } = useAuth()

  // Get auth token with refresh if close to expiry
  const getAuthToken = useCallback(async () => {
    if (!session?.access_token) return null

    if (session.expires_at) {
      const expirationTime = session.expires_at * 1000
      const now = Date.now()
      const fiveMinutes = 5 * 60 * 1000

      if (expirationTime - now < fiveMinutes) {
        const { data, error } = await supabase.auth.refreshSession()
        if (!error && data?.session?.access_token) {
          return data.session.access_token
        }
      }
    }

    return session.access_token
  }, [session])

  // Fetch wrapper that retries once on 401
  const fetchWithAuth = useCallback(async (url: string, options: RequestInit = {}) => {
    const token = await getAuthToken()
    let response = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      credentials: 'include'
    })

    if (response.status === 401) {
      const { data, error } = await supabase.auth.refreshSession()
      if (!error && data?.session?.access_token) {
        response = await fetch(url, {
          ...options,
          headers: {
            ...(options.headers || {}),
            Authorization: `Bearer ${data.session.access_token}`
          },
          credentials: 'include'
        })
      }
    }

    return response
  }, [getAuthToken])

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetchWithAuth('/api/documents')
      
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
  }, [fetchWithAuth])

  const deleteDocument = useCallback(async (documentId: string): Promise<boolean> => {
    try {
      const response = await fetchWithAuth(`/api/documents/${documentId}`, {
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
  }, [fetchWithAuth])

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