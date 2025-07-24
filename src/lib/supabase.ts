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
  },
})
