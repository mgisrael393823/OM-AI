import { createClient } from '@supabase/supabase-js'
import { getConfig, isProduction } from './config'

const config = getConfig();

// Validate Supabase configuration
if (!config.supabase.url || !config.supabase.anonKey) {
  const errors = [];
  if (!config.supabase.url) errors.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!config.supabase.anonKey) errors.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  
  // Only throw in production or if both are missing
  if (isProduction() || errors.length === 2) {
    throw new Error(`Missing required Supabase environment variables: ${errors.join(', ')}`);
  }
  
  console.warn(`⚠️  Missing Supabase configuration: ${errors.join(', ')}`);
}

// Create Supabase client with validated credentials
export const supabase = createClient(
  config.supabase.url || 'http://localhost:54321', // Fallback for development
  config.supabase.anonKey || 'dummy-anon-key',     // Fallback for development
  {
    auth: {
      persistSession: true,
      detectSessionInUrl: true
    }
  }
)