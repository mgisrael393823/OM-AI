#!/usr/bin/env node

/**
 * Upload a test document using the in-memory processing
 */

const fs = require('fs')
const FormData = require('form-data')

const GUEST_EMAIL = 'guest@om-ai.dev'
const GUEST_PASSWORD = 'guestpass123'

async function uploadTestDocument() {
  console.log('📤 Uploading test document...')

  // Step 1: Login
  const loginResponse = await fetch('http://127.0.0.1:54321/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
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
  console.log('✅ Logged in successfully')

  // Step 2: Upload document using in-memory processing
  const pdfPath = './test-om-pdfs/X Tampa OM .pdf'
  
  if (!fs.existsSync(pdfPath)) {
    console.error('❌ Test PDF not found at:', pdfPath)
    return
  }

  const formData = new FormData()
  formData.append('file', fs.createReadStream(pdfPath))

  try {
    console.log('📄 Processing document...')
    const uploadResponse = await fetch('http://127.0.0.1:3000/api/process-pdf-memory', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authData.access_token}`
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

    return uploadResult

  } catch (error) {
    console.error('💥 Upload error:', error.message)
  }
}

uploadTestDocument().catch(console.error)