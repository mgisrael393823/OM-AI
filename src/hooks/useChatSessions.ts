import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/AuthContext"

export interface ChatSession {
  id: string
  title: string | null
  document_id: string | null
  created_at: string
  updated_at: string
  messages?: any[]
}

// Simple in-memory cache for deduplication
const sessionCache = new Map<string, { data: ChatSession[], timestamp: number }>()
const CACHE_TTL = 10000 // 10 seconds deduplication interval

// Dev-only debug logging
const debugLog = (message: string, data?: any) => {
  if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_DEBUG_FETCHES === 'true') {
    console.log(`[useChatSessions] ${message}`, data)
  }
}

/**
 * Centralized chat sessions hook with deduplication
 * Implements SWR-like behavior with built-in deduplication
 */
export function useChatSessions() {
  const { user, session } = useAuth()
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const userId = user?.id
  const cacheKey = `chat-sessions:${userId || 'anonymous'}`

  const fetchSessions = async (force = false): Promise<ChatSession[]> => {
    if (!user || !session) {
      debugLog('No user/session, skipping fetch')
      return []
    }

    // Check cache first unless force refresh
    if (!force) {
      const cached = sessionCache.get(cacheKey)
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        debugLog('Cache hit', { cacheKey, age: Date.now() - cached.timestamp })
        return cached.data
      }
    }

    debugLog('Cache miss or force refresh, fetching...', { cacheKey, force })
    
    try {
      const response = await fetch(`${window.location.origin}/api/chat-sessions`, {
        credentials: 'include',
        headers: {
          "Authorization": `Bearer ${session.access_token}`
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch sessions`)
      }

      const data = await response.json()
      const fetchedSessions = data.sessions || []
      
      // Update cache
      sessionCache.set(cacheKey, {
        data: fetchedSessions,
        timestamp: Date.now()
      })
      
      debugLog('Fetch complete', { 
        cacheKey, 
        count: fetchedSessions.length,
        cacheSize: sessionCache.size 
      })
      
      return fetchedSessions
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error fetching sessions'
      debugLog('Fetch error', { cacheKey, error: errorMessage })
      throw new Error(errorMessage)
    }
  }

  // Main fetch function with state management
  const loadSessions = async (force = false) => {
    if (!user || !session) return

    setIsLoading(true)
    setError(null)
    
    try {
      const fetchedSessions = await fetchSessions(force)
      setSessions(fetchedSessions)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load sessions'
      setError(errorMessage)
      console.error('[useChatSessions] Load error:', errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  // Auto-load on mount and auth change
  useEffect(() => {
    if (user && session) {
      debugLog('Auth state changed, loading sessions', { userId: user.id })
      loadSessions()
    } else {
      // Clear state when no auth
      setSessions([])
      setError(null)
    }
  }, [user?.id, session?.access_token]) // Only depend on stable auth identifiers

  // Manual refresh function
  const refresh = () => {
    debugLog('Manual refresh requested', { cacheKey })
    return loadSessions(true)
  }

  // Cache invalidation for external use
  const invalidateCache = () => {
    sessionCache.delete(cacheKey)
    debugLog('Cache invalidated', { cacheKey })
  }

  return {
    sessions,
    isLoading,
    error,
    refresh,
    invalidateCache,
    // Internal for debugging
    cacheKey: process.env.NODE_ENV === 'development' ? cacheKey : undefined
  }
}

// Global cache management utilities
export const chatSessionsCache = {
  clear: () => {
    const size = sessionCache.size
    sessionCache.clear()
    debugLog('Global cache cleared', { previousSize: size })
  },
  
  size: () => sessionCache.size,
  
  // Dev utility to inspect cache
  inspect: process.env.NODE_ENV === 'development' 
    ? () => Array.from(sessionCache.entries()).map(([key, value]) => ({
        key,
        age: Date.now() - value.timestamp,
        count: value.data.length
      }))
    : undefined
}