#!/usr/bin/env node

/**
 * Create a test user for smoke tests
 */

const { createClient } = require('@supabase/supabase-js')

// Live Supabase configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dewhycvbsaueixiimwow.supabase.co'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRld2h5Y3Zic2F1ZWl4aWltd293Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyMjIwMDMsImV4cCI6MjA2ODc5ODAwM30.MO3MBRbwzVdPR6uTetuFLP6xheMtftl5O4Mhasxslkc'

// Test user credentials
const TEST_EMAIL = 'test@om-ai.com'
const TEST_PASSWORD = 'testpass123'

async function createTestUser() {
  console.log('👤 Creating test user for smoke tests\n')

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  
  try {
    // Try to sign up
    const { data, error } = await supabase.auth.signUp({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      options: {
        data: {
          name: 'Test User'
        }
      }
    })

    if (error) {
      // Check if user already exists
      if (error.message.includes('already been registered')) {
        console.log('✅ Test user already exists, trying to sign in...')
        
        const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
        })

        if (loginError) {
          console.error('❌ Login failed:', loginError.message)
          return
        }

        console.log('✅ Successfully logged in as test user')
        console.log('   Email:', loginData.user.email)
        console.log('   User ID:', loginData.user.id)
        return loginData.user.id
      } else {
        console.error('❌ Signup failed:', error.message)
        return
      }
    }

    console.log('✅ Test user created successfully!')
    console.log('   Email:', data.user.email)
    console.log('   User ID:', data.user.id)
    console.log('   Email confirmation required:', data.user.email_confirmed_at === null)
    
    return data.user.id

  } catch (error) {
    console.error('💥 Error:', error.message)
  }
}

createTestUser().catch(console.error)