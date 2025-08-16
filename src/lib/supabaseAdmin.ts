import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * Runtime factory for Supabase admin client
 * Reads environment variables at runtime to prevent import-time freezing
 */
export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    throw new Error('SUPABASE_ADMIN_MISCONFIG: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  
  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}