#!/usr/bin/env node

/**
 * Simple guest user creation script
 */

const { createClient } = require('@supabase/supabase-js')

// Supabase configuration - read from environment
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables:')
  console.error('   SUPABASE_URL:', !!SUPABASE_URL)
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', !!SUPABASE_SERVICE_ROLE_KEY)
  console.error('\nPlease set these environment variables before running this script.')
  console.error('For local development: SUPABASE_URL=http://127.0.0.1:54321')
  process.exit(1)
}

async function createGuest() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  const email = 'guest@om-ai.dev'
  const password = 'guestpass123'
  const name = 'Guest User'

  try {
    console.log('🔧 Creating guest user...')
    
    // Create user in one transaction
    const { data, error } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: name,
      }
    })

    if (error) {
      if (error.message.includes('already registered')) {
        console.log('✅ Guest user already exists')
        console.log('🔑 Credentials:')
        console.log('   Email:', email)
        console.log('   Password:', password)
        return
      }
      console.error('❌ Error:', error)
      return
    }

    console.log('✅ Guest user created!')
    console.log('🔑 Credentials:')
    console.log('   Email:', email)
    console.log('   Password:', password)
    console.log('   User ID:', data.user.id)

  } catch (error) {
    console.error('💥 Error:', error)
  }
}

createGuest()