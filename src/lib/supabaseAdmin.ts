import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * Runtime factory for Supabase admin client
 * Reads environment variables at runtime to prevent import-time freezing
 * Includes enhanced validation for non-test environments
 */
export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  // Enhanced validation for non-test environments
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID;
  
  if (!url || !key) {
    const error = new Error(
      `SUPABASE_ADMIN_MISCONFIG: Missing required environment variables.\n` +
      `  SUPABASE_URL: ${url ? '✓ Set' : '❌ Missing'}\n` +
      `  SUPABASE_SERVICE_ROLE_KEY: ${key ? '✓ Set' : '❌ Missing'}\n` +
      `\nEnsure these are set in your .env.local file or environment.`
    );
    
    if (!isTestEnv) {
      // In non-test environments, this is a critical error
      console.error('\n❌ Critical Configuration Error:', error.message);
      throw error;
    } else {
      // In test environments, provide a more helpful message
      console.warn('\n⚠️ Warning: Missing Supabase config in test environment');
      throw error;
    }
  }
  
  // Additional validation: ensure the key is not a placeholder or demo key
  if (!isTestEnv && (key.includes('demo') || key.includes('placeholder') || key.length < 50)) {
    throw new Error(
      'SUPABASE_ADMIN_INVALID_KEY: The SUPABASE_SERVICE_ROLE_KEY appears to be invalid or a demo key. ' +
      'Please ensure you are using the correct service role key from your Supabase project settings.'
    );
  }
  
  try {
    return createClient<Database>(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  } catch (clientError) {
    throw new Error(
      `SUPABASE_CLIENT_INIT_FAILED: Failed to initialize Supabase client. ` +
      `This may indicate an invalid URL or service role key. Error: ${clientError}`
    );
  }
}