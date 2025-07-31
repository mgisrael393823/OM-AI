/**
 * Development utilities for managing authentication cache and storage issues
 */

export const DEV_AUTH_UTILS = {
  /**
   * Clear all authentication-related storage
   */
  clearAuthStorage: () => {
    if (typeof window === 'undefined') return

    try {
      // Clear all Supabase auth tokens
      const keysToRemove = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.includes('supabase') || key?.includes('sb-') || key?.includes('auth-token')) {
          keysToRemove.push(key)
        }
      }
      
      keysToRemove.forEach(key => localStorage.removeItem(key))
      
      // Clear session storage auth data
      const sessionKeysToRemove = []
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)
        if (key?.includes('supabase') || key?.includes('sb-') || key?.includes('auth')) {
          sessionKeysToRemove.push(key)
        }
      }
      
      sessionKeysToRemove.forEach(key => sessionStorage.removeItem(key))
      
      console.log('🧹 Cleared auth storage:', { localStorage: keysToRemove, sessionStorage: sessionKeysToRemove })
    } catch (error) {
      console.warn('Failed to clear auth storage:', error)
    }
  },

  /**
   * Log current authentication storage state
   */
  debugAuthStorage: () => {
    if (typeof window === 'undefined') return

    const authKeys = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.includes('supabase') || key?.includes('sb-') || key?.includes('auth-token')) {
        try {
          const value = localStorage.getItem(key)
          const parsed = value ? JSON.parse(value) : null
          authKeys.push({
            key,
            hasValue: !!value,
            expiresAt: parsed?.expires_at ? new Date(parsed.expires_at * 1000).toISOString() : null,
            accessToken: parsed?.access_token ? `${parsed.access_token.substring(0, 20)}...` : null,
          })
        } catch {
          authKeys.push({ key, hasValue: !!localStorage.getItem(key), error: 'Parse error' })
        }
      }
    }

    console.log('🔍 Auth storage debug:', authKeys)
    return authKeys
  },

  /**
   * Force refresh authentication state
   */
  forceAuthRefresh: async () => {
    if (typeof window === 'undefined') return

    try {
      // Clear storage first
      DEV_AUTH_UTILS.clearAuthStorage()
      
      // Force page reload to reinitialize auth state
      window.location.reload()
    } catch (error) {
      console.error('Failed to force auth refresh:', error)
    }
  },

  /**
   * Check if there are stale auth tokens
   */
  hasStaleTokens: () => {
    if (typeof window === 'undefined') return false

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.includes('supabase') || key?.includes('sb-') || key?.includes('auth-token')) {
          const value = localStorage.getItem(key)
          if (value) {
            const parsed = JSON.parse(value)
            if (parsed.expires_at) {
              const expiresAt = new Date(parsed.expires_at * 1000)
              const now = new Date()
              if (expiresAt <= now) {
                console.log('🚨 Found stale token:', key, 'expired at', expiresAt.toISOString())
                return true
              }
            }
          }
        }
      }
      return false
    } catch {
      return false
    }
  },

  /**
   * Add development auth debugging to window object
   */
  exposeToWindow: () => {
    if (typeof window === 'undefined' || process.env.NODE_ENV !== 'development') return

    (window as any).devAuth = DEV_AUTH_UTILS
    console.log('🔧 Development auth utils available at window.devAuth')
    console.log('Available methods: clearAuthStorage, debugAuthStorage, forceAuthRefresh, hasStaleTokens')
  }
}

// Auto-expose in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  DEV_AUTH_UTILS.exposeToWindow()
}