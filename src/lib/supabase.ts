import { createClient } from '@supabase/supabase-js'
import { getConfig } from './config'

const config = getConfig();

// Validate Supabase configuration strictly
if (!config.supabase.url || !config.supabase.anonKey) {
  const missing: string[] = []
  if (!config.supabase.url) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!config.supabase.anonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  throw new Error(
    `Missing Supabase environment variables: ${missing.join(', ')}`
  )
}

// Create Supabase client using provided credentials
export const supabase = createClient(config.supabase.url, config.supabase.anonKey, {
  auth: {
    persistSession: true,
    detectSessionInUrl: true,
    // Development-specific configurations to reduce cache issues
    ...(process.env.NODE_ENV === 'development' && {
      storageKey: `sb-${config.supabase.url.split('//')[1]?.split('.')[0]}-auth-token-dev`,
      storage: {
        getItem: (key: string) => {
          try {
            const item = localStorage.getItem(key)
            // In development, add timestamp check for session freshness
            if (item) {
              const parsed = JSON.parse(item)
              if (parsed.expires_at) {
                const expiresAt = new Date(parsed.expires_at * 1000)
                const now = new Date()
                // Clear session if expired
                if (expiresAt <= now) {
                  localStorage.removeItem(key)
                  return null
                }
              }
            }
            return item
          } catch {
            return null
          }
        },
        setItem: (key: string, value: string) => {
          try {
            localStorage.setItem(key, value)
          } catch {
            // Ignore storage errors in development
          }
        },
        removeItem: (key: string) => {
          try {
            localStorage.removeItem(key)
          } catch {
            // Ignore storage errors in development
          }
        },
      },
    }),
  },
})
