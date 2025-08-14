#!/usr/bin/env node

/**
 * Test upload with the existing test user from production
 */

const GUEST_EMAIL = 'test+local@om.ai'
const GUEST_PASSWORD = 'testing123'

async function testProductionUpload() {
  console.log('🧪 Testing with production test user\n')

  // Step 1: Login using direct Supabase auth
  const loginResponse = await fetch('https://dewhycvbsaueixiimwow.supabase.co/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRld2h5Y3Zic2F1ZWl4aWltd293Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyMjIwMDMsImV4cCI6MjA2ODc5ODAwM30.MO3MBRbwzVdPR6uTetuFLP6xheMtftl5O4Mhasxslkc'
    },
    body: JSON.stringify({
      email: GUEST_EMAIL,
      password: GUEST_PASSWORD
    })
  })

  if (!loginResponse.ok) {
    console.error('❌ Login failed:', await loginResponse.text())
    return
  }

  const authData = await loginResponse.json()
  console.log('✅ Logged in successfully as:', GUEST_EMAIL)

  // Step 2: Test just the chat API with document context to see the error message format
  console.log('\n💬 Testing chat to check response format...')
  
  try {
    const chatResponse = await fetch('http://127.0.0.1:3000/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authData.access_token}`
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: 'Hello, how are you?' }
        ]
      })
    })

    const chatResult = await chatResponse.json()
    
    if (!chatResponse.ok) {
      console.log(`❌ Chat failed (${chatResponse.status}): ${chatResult.error || chatResult.message}`)
    } else {
      console.log(`✅ Chat succeeded!`)
      console.log(`📝 Response format check:`)
      console.log(`   Has message: ${!!chatResult.message}`)
      console.log(`   Has model: ${!!chatResult.model}`)
      console.log(`   Message preview: ${chatResult.message?.slice(0, 50)}...`)
      console.log(`   Full response keys:`, Object.keys(chatResult))
    }

  } catch (error) {
    console.error('💥 Error:', error.message)
  }

  console.log('\n🏁 Production test completed!')
}

testProductionUpload().catch(console.error)