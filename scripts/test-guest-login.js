#!/usr/bin/env node

/**
 * Test guest user login
 */

const { createClient } = require('@supabase/supabase-js')

// Local Supabase configuration (using anon key like frontend would)
const SUPABASE_URL = 'http://127.0.0.1:54321'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

async function testLogin() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  const email = 'guest@om-ai.dev'
  const password = 'guestpass123'

  try {
    console.log('🔐 Testing guest user login...')
    console.log('   Email:', email)
    console.log('   Password:', password)
    console.log('')

    const startTime = Date.now()
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    })

    const duration = Date.now() - startTime

    if (error) {
      console.error('❌ Login failed after', duration + 'ms')
      console.error('   Error:', error.message)
      console.error('   Code:', error.status || 'unknown')
      return
    }

    if (data.user) {
      console.log('✅ Login successful after', duration + 'ms')
      console.log('   User ID:', data.user.id)
      console.log('   Email:', data.user.email)
      console.log('   Full Name:', data.user.user_metadata?.full_name || 'Not set')
      console.log('   Session expires:', new Date(data.session.expires_at * 1000).toLocaleString())
      
      // Test profile fetch
      console.log('')
      console.log('📋 Testing profile fetch...')
      const profileStart = Date.now()
      
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', data.user.id)
        .single()
      
      const profileDuration = Date.now() - profileStart
      
      if (profileError) {
        console.error('❌ Profile fetch failed after', profileDuration + 'ms')
        console.error('   Error:', profileError.message)
      } else {
        console.log('✅ Profile fetched after', profileDuration + 'ms')
        console.log('   Full Name:', profile.full_name)
        console.log('   Tier:', profile.subscription_tier)
        console.log('   Usage:', profile.usage_count + '/' + profile.usage_limit)
      }
      
    } else {
      console.log('⚠️ Login returned no user after', duration + 'ms')
    }

  } catch (error) {
    console.error('💥 Login exception:', error.message)
  }
}

testLogin()