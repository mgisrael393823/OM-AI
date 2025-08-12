import useSWR from 'swr'
import { useAuth } from "@/contexts/AuthContext"

export interface ChatSession {
  id: string
  title: string | null
  document_id: string | null
  created_at: string
  updated_at: string
  messages?: any[]
}

// Dev-only debug logging
const debugLog = (message: string, data?: any) => {
  if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_DEBUG_FETCHES === 'true') {
    console.log(`[useChatSessions] ${message}`, data)
  }
}

// SWR fetcher function
const fetcher = async ([url, accessToken]: [string, string]): Promise<ChatSession[]> => {
  debugLog('SWR fetcher called', { url, hasToken: !!accessToken })
  
  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      "Authorization": `Bearer ${accessToken}`
    }
  })

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}: Failed to fetch sessions`)
    debugLog('Fetch error', { status: response.status, url })
    throw error
  }

  const data = await response.json()
  const sessions = data.sessions || []
  
  debugLog('Fetch complete', { 
    url, 
    count: sessions.length 
  })
  
  return sessions
}

/**
 * Centralized chat sessions hook with SWR deduplication
 * Eliminates duplicate requests through proper SWR configuration
 */
export function useChatSessions() {
  const { user, session } = useAuth()
  
  const userId = user?.id
  const accessToken = session?.access_token
  
  // Stable SWR key - only changes when userId changes
  const swrKey = userId && accessToken 
    ? ['chat-sessions', userId] as const
    : null

  debugLog('SWR key generated', { 
    swrKey, 
    userId: userId || 'none',
    hasToken: !!accessToken 
  })

  const {
    data: sessions = [],
    error,
    isLoading,
    mutate: refresh
  } = useSWR(
    swrKey,
    // Fetcher gets [key, userId] but needs [url, token]
    swrKey ? () => fetcher([`${window.location.origin}/api/chat-sessions`, accessToken!]) : null,
    {
      // Aggressive deduplication settings
      dedupingInterval: 2000, // 2 seconds
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      refreshInterval: 0,
      revalidateIfStale: false,
      errorRetryCount: 3,
      errorRetryInterval: 1000,
      // Keep previous data on error
      keepPreviousData: true,
      
      // Debug configuration
      onSuccess: (data) => {
        debugLog('SWR success', { 
          count: data.length,
          swrKey 
        })
      },
      
      onError: (error) => {
        debugLog('SWR error', { 
          error: error.message,
          swrKey 
        })
      }
    }
  )

  // Cache invalidation for external use
  const invalidateCache = () => {
    debugLog('Cache invalidated via mutate', { swrKey })
    return refresh()
  }

  return {
    sessions,
    isLoading,
    error,
    refresh,
    invalidateCache,
    // Internal for debugging
    swrKey: process.env.NODE_ENV === 'development' ? swrKey : undefined
  }
}

// Global cache management utilities (now handled by SWR)
export const chatSessionsCache = {
  clear: () => {
    debugLog('Global cache clear requested - handled by SWR')
    // SWR handles its own cache, no manual clearing needed
  },
  
  size: () => 0, // SWR manages its own cache size
  
  // Dev utility - SWR has its own cache inspection
  inspect: process.env.NODE_ENV === 'development' 
    ? () => []
    : undefined
}