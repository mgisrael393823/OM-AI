#!/usr/bin/env node

/**
 * Create a guest user for development/testing
 * This script uses the Supabase Admin API to create a user and profile
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

// Guest user credentials
const GUEST_EMAIL = 'guest@om-ai.dev'
const GUEST_PASSWORD = 'guestpass123'
const GUEST_NAME = 'Guest User'

async function createGuestUser() {
  console.log('🔧 Creating guest user for OM-AI...')
  
  // Create admin client
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  try {
    // Check if user already exists
    const { data: existingUsers, error: checkError } = await supabase.auth.admin.listUsers()
    
    if (checkError) {
      console.error('❌ Error checking existing users:', checkError)
      return
    }

    const existingUser = existingUsers.users.find(user => user.email === GUEST_EMAIL)
    
    if (existingUser) {
      console.log('✅ Guest user already exists:', GUEST_EMAIL)
      console.log('   User ID:', existingUser.id)
      console.log('   Created:', existingUser.created_at)
      
      // Check if profile exists
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', existingUser.id)
        .single()
      
      if (profile) {
        console.log('   Profile: ✅ exists')
      } else {
        console.log('   Profile: ❌ missing - creating...')
        const { error: profileError } = await supabase
          .from('users')
          .insert({
            id: existingUser.id,
            email: GUEST_EMAIL,
            full_name: GUEST_NAME,
            subscription_tier: 'starter',
            subscription_status: 'active',
            usage_count: 0,
            usage_limit: 10
          })
        
        if (profileError) {
          console.error('❌ Error creating missing profile:', profileError)
        } else {
          console.log('   Profile: ✅ created')
        }
      }
      
      console.log('')
      console.log('🔑 Login credentials:')
      console.log('   Email:', GUEST_EMAIL)
      console.log('   Password:', GUEST_PASSWORD)
      return
    }

    // Create new user via Admin API
    console.log('👤 Creating new guest user...')
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: GUEST_EMAIL,
      password: GUEST_PASSWORD,
      email_confirm: true, // Skip email confirmation
      user_metadata: {
        full_name: GUEST_NAME,
      }
    })

    if (authError) {
      console.error('❌ Error creating user:', authError)
      return
    }

    const user = authData.user
    console.log('✅ User created in auth.users:', user.id)

    // Create profile in public.users table
    console.log('📝 Creating user profile...')
    const { data: profileData, error: profileError } = await supabase
      .from('users')
      .insert({
        id: user.id,
        email: GUEST_EMAIL,
        full_name: GUEST_NAME,
        subscription_tier: 'starter',
        subscription_status: 'active',
        usage_count: 0,
        usage_limit: 10
      })
      .select()
      .single()

    if (profileError) {
      console.error('❌ Error creating profile:', profileError)
      // Try to clean up auth user if profile creation failed
      await supabase.auth.admin.deleteUser(user.id)
      return
    }

    console.log('✅ Profile created in public.users')
    console.log('')
    console.log('🎉 Guest user created successfully!')
    console.log('')
    console.log('🔑 Login credentials:')
    console.log('   Email:', GUEST_EMAIL)
    console.log('   Password:', GUEST_PASSWORD)
    console.log('')
    console.log('👤 User details:')
    console.log('   ID:', user.id)
    console.log('   Name:', GUEST_NAME)
    console.log('   Tier:', profileData.subscription_tier)
    console.log('   Usage:', `${profileData.usage_count}/${profileData.usage_limit}`)

  } catch (error) {
    console.error('💥 Unexpected error:', error)
  }
}

// Run the script
createGuestUser()