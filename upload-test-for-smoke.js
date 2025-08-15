#!/usr/bin/env node

/**
 * Upload test PDF and get memory ID for smoke tests
 */

const { createClient } = require('@supabase/supabase-js')
const FormData = require('form-data')
const fs = require('fs')

// Live Supabase configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dewhycvbsaueixiimwow.supabase.co'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRld2h5Y3Zic2F1ZWl4aWltd293Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyMjIwMDMsImV4cCI6MjA2ODc5ODAwM30.MO3MBRbwzVdPR6uTetuFLP6xheMtftl5O4Mhasxslkc'

const BASE_URL = 'http://localhost:3000'

// Test user credentials  
const TEST_EMAIL = process.env.TEST_EMAIL || 'test@om-ai.com'
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'testpass123'

async function uploadTestDocument() {
  console.log('📤 Uploading test document for smoke tests\n')

  // Step 1: Login
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  })

  if (authError) {
    console.error('❌ Auth failed:', authError.message)
    console.log('📝 Note: You may need to create a test user first')
    return
  }

  console.log('✅ Logged in as:', authData.user.email)
  const session = authData.session

  // Step 2: Upload document using in-memory processing
  const pdfPath = './test-om-pdfs/X Tampa OM .pdf'
  
  if (!fs.existsSync(pdfPath)) {
    console.error('❌ Test PDF not found at:', pdfPath)
    return
  }

  console.log('📤 Uploading document for in-memory processing...')
  
  const formData = new FormData()
  formData.append('file', fs.createReadStream(pdfPath))

  try {
    const uploadResponse = await fetch(`${BASE_URL}/api/process-pdf-memory`, {
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
    console.log('   Memory ID:', uploadResult.requestId)
    console.log('   Pages:', uploadResult.document.pageCount)
    console.log('   Chunks:', uploadResult.document.chunkCount)
    console.log('   Processing time:', uploadResult.processingTimeMs + 'ms')

    const memoryId = uploadResult.requestId
    console.log(`\n🎯 Use this Memory ID for smoke tests: ${memoryId}`)
    
    return memoryId

  } catch (error) {
    console.error('💥 Error:', error.message)
  }
}

uploadTestDocument().catch(console.error)