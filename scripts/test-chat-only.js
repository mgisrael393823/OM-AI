#!/usr/bin/env node

/**
 * Test just the chat API to debug the model selection issue
 */

const { createClient } = require('@supabase/supabase-js')

// Local Supabase configuration
const SUPABASE_URL = 'http://127.0.0.1:54321'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const GUEST_EMAIL = 'guest@om-ai.dev'
const GUEST_PASSWORD = 'guestpass123'

async function testChatAPI() {
  console.log('🔬 Testing Chat API with different configurations\n')

  // Login
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: GUEST_EMAIL,
    password: GUEST_PASSWORD,
  })

  if (authError) {
    console.error('❌ Auth failed:', authError.message)
    return
  }

  console.log('✅ Logged in as:', authData.user.email)
  const session = authData.session

  // Test different request formats
  const testCases = [
    {
      name: 'Basic chat without model',
      body: {
        messages: [{ role: 'user', content: 'Hello' }]
      }
    },
    {
      name: 'Chat with explicit gpt-4o model',
      body: {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hello' }]
      }
    },
    {
      name: 'Chat with document context',
      body: {
        messages: [{ role: 'user', content: 'What is the cap rate?' }],
        metadata: { documentId: '2498dd3d-73a6-42cf-91e7-414cab68a4e1' }
      }
    },
    {
      name: 'Chat with document context + explicit model',
      body: {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'What is the cap rate?' }],
        metadata: { documentId: '2498dd3d-73a6-42cf-91e7-414cab68a4e1' }
      }
    }
  ]

  for (const testCase of testCases) {
    console.log(`\n🧪 Testing: ${testCase.name}`)
    
    try {
      const response = await fetch('http://127.0.0.1:3000/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(testCase.body)
      })

      const result = await response.json()
      
      if (!response.ok) {
        console.log(`   ❌ Failed (${response.status}): ${result.error || result.message}`)
        console.log(`   Code: ${result.code}`)
        if (result.details) {
          console.log(`   Details:`, JSON.stringify(result.details, null, 2))
        }
      } else {
        console.log(`   ✅ Success: ${result.message?.slice(0, 100)}...`)
        console.log(`   Model: ${result.model}`)
        if (result.usage) {
          console.log(`   Tokens: ${result.usage.total_tokens}`)
        }
      }
    } catch (err) {
      console.log(`   ❌ Request failed: ${err.message}`)
    }
  }

  console.log('\n🏁 Chat API test completed!')
}

testChatAPI().catch(console.error)