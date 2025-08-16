import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Ensures a user profile exists in public.users table
 * This is required before inserting into public.documents
 * If the auth->profile trigger is missing in prod, this creates the profile
 */
export async function ensureUserProfile(userId: string): Promise<void> {
  if (!userId) {
    throw new Error('USER_ID_REQUIRED: userId is required for profile creation');
  }

  try {
    const supabase = getSupabaseAdmin();
    
    // Check if user profile already exists
    const { data: existingUser, error: selectError } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();
    
    if (existingUser) {
      // Profile already exists
      return;
    }
    
    if (selectError && selectError.code !== 'PGRST116') {
      // PGRST116 is "not found" - other errors are real problems
      throw new Error(`USER_PROFILE_CHECK_FAILED: ${selectError.message}`);
    }
    
    // Profile doesn't exist, create it
    // Note: We can't get the email from auth without additional queries
    // This creates a minimal profile that can be updated later
    const { error: insertError } = await supabase
      .from('users')
      .upsert({
        id: userId,
        email: '', // Will be updated by auth trigger if available
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id',
        ignoreDuplicates: true
      });
    
    if (insertError) {
      throw new Error(`USER_PROFILE_CREATE_FAILED: ${insertError.message}`);
    }
    
    console.log('User profile ensured for userId:', userId);
    
  } catch (error) {
    console.error('Failed to ensure user profile:', error);
    throw error;
  }
}