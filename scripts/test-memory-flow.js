#!/usr/bin/env node

/**
 * Test the in-memory document processing flow end-to-end
 */

const { createClient } = require('@supabase/supabase-js')

// Local Supabase configuration
const SUPABASE_URL = 'http://127.0.0.1:54321'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const GUEST_EMAIL = 'guest@om-ai.dev'
const GUEST_PASSWORD = 'guestpass123'

async function testMemoryFlow() {
  console.log('🧪 Testing In-Memory Document Processing Flow\n')

  // Step 1: Login
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

  // Step 2: Upload document using in-memory processing (simulate what frontend does)
  const FormData = require('form-data')
  const fs = require('fs')
  
  const pdfPath = './test-om-pdfs/X Tampa OM .pdf'
  
  if (!fs.existsSync(pdfPath)) {
    console.error('❌ Test PDF not found at:', pdfPath)
    return
  }

  console.log('\n📤 Uploading document for in-memory processing...')
  
  const formData = new FormData()
  formData.append('file', fs.createReadStream(pdfPath))

  try {
    const uploadResponse = await fetch('http://127.0.0.1:3000/api/process-pdf-memory', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      },
      body: formData
    })

    const uploadResult = await uploadResponse.json()

    if (!uploadResponse.ok) {
      console.error('❌ Upload failed:', uploadResult.error || uploadResult.message)
      return
    }

    console.log('✅ Document processed successfully!')
    console.log('📋 Document details:')
    console.log('   Request ID:', uploadResult.requestId)
    console.log('   Pages:', uploadResult.document.pageCount)
    console.log('   Chunks:', uploadResult.document.chunkCount)
    console.log('   Processing time:', uploadResult.processingTimeMs + 'ms')

    const requestId = uploadResult.requestId

    // Step 3: Test chat with document context
    console.log(`\n💬 Testing chat with document context (${requestId})...`)
    
    const chatResponse = await fetch('http://127.0.0.1:3000/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: 'What is the cap rate mentioned in this document?' }
        ],
        metadata: {
          documentId: requestId
        }
      })
    })

    const chatResult = await chatResponse.json()
    
    if (!chatResponse.ok) {
      console.log(`❌ Chat failed (${chatResponse.status}): ${chatResult.error || chatResult.message}`)
      console.log(`   Code: ${chatResult.code}`)
      if (chatResult.details) {
        console.log(`   Details:`, JSON.stringify(chatResult.details, null, 2))
      }
    } else {
      console.log(`✅ Chat succeeded!`)
      console.log(`📝 Response: ${chatResult.message}`)
      console.log(`🤖 Model: ${chatResult.model}`)
      if (chatResult.usage) {
        console.log(`📊 Tokens: ${chatResult.usage.total_tokens}`)
      }
    }

  } catch (error) {
    console.error('💥 Error:', error.message)
  }

  console.log('\n🏁 In-memory flow test completed!')
}

testMemoryFlow().catch(console.error)