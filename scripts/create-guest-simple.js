#!/usr/bin/env node

/**
 * Simple guest user creation script
 */

const { createClient } = require('@supabase/supabase-js')

// Local Supabase configuration
const SUPABASE_URL = 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

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