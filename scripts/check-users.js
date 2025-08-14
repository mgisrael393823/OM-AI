#!/usr/bin/env node

/**
 * Check existing users in both auth.users and public.users
 */

const { createClient } = require('@supabase/supabase-js')

// Local Supabase configuration
const SUPABASE_URL = 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

async function checkUsers() {
  console.log('🔍 Checking existing users...')
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  try {
    // Check auth.users
    console.log('\n📋 Users in auth.users:')
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers()
    
    if (authError) {
      console.error('❌ Error listing auth users:', authError)
    } else {
      authUsers.users.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.email} (${user.id}) - ${user.created_at}`)
      })
      console.log(`   Total: ${authUsers.users.length} users`)
    }

    // Check public.users
    console.log('\n📋 Users in public.users:')
    const { data: publicUsers, error: publicError } = await supabase
      .from('users')
      .select('id, email, full_name, subscription_tier, created_at')
      .order('created_at', { ascending: false })

    if (publicError) {
      console.error('❌ Error listing public users:', publicError)
    } else {
      publicUsers.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.email} (${user.id}) - ${user.subscription_tier} - ${user.created_at}`)
      })
      console.log(`   Total: ${publicUsers.length} users`)
    }

  } catch (error) {
    console.error('💥 Unexpected error:', error)
  }
}

checkUsers()