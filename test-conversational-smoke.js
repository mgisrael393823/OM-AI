#!/usr/bin/env node

/**
 * Smoke tests for conversational chat enhancement
 * Tests three specific scenarios with PDF citations
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

// Live Supabase configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dewhycvbsaueixiimwow.supabase.co'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRld2h5Y3Zic2F1ZWl4aWltd293Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyMjIwMDMsImV4cCI6MjA2ODc5ODAwM30.MO3MBRbwzVdPR6uTetuFLP6xheMtftl5O4Mhasxslkc'

const BASE_URL = 'http://localhost:3000'

// Test user credentials (create a test user if needed)
const TEST_EMAIL = process.env.TEST_EMAIL || 'test@om-ai.com'
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'testpass123'

async function testConversationalChat() {
  console.log('🧪 Running Conversational Chat Smoke Tests\n')

  // Step 1: Login
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  })

  if (authError) {
    console.error('❌ Auth failed:', authError.message)
    return
  }

  console.log('✅ Logged in as:', authData.user.email)
  const session = authData.session

  // For testing, we'll assume we have a document already uploaded
  // In production, you'd upload a test PDF first
  const TEST_DOCUMENT_ID = 'mem-test-doc' // Replace with actual document ID
  
  console.log(`🔍 Testing with document ID: ${TEST_DOCUMENT_ID}`)

  // Helper function to test chat with streaming
  async function testChatWithStreaming(query, testName) {
    console.log(`\n💬 ${testName}: "${query}"`)
    
    try {
      const response = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: query }],
          documentId: TEST_DOCUMENT_ID
        })
      })

      if (!response.ok) {
        console.log(`❌ ${testName} failed (${response.status})`)
        return
      }

      // Check for SSE streaming
      const contentType = response.headers.get('content-type')
      if (!contentType.includes('text/event-stream')) {
        console.log(`❌ ${testName}: Expected SSE streaming, got ${contentType}`)
        return
      }

      console.log(`✅ ${testName}: SSE streaming confirmed`)

      // Read SSE stream
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullResponse = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        
        // Process SSE format: data: {"content": "text"}\n\n
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') break
            
            try {
              const parsed = JSON.parse(data)
              if (parsed.content) {
                fullResponse += parsed.content
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }

      console.log(`📝 Response: ${fullResponse.substring(0, 200)}...`)
      
      // Check for page citations
      const pageMatches = fullResponse.match(/\[Page \d+\]/g)
      if (pageMatches && pageMatches.length > 0) {
        console.log(`✅ ${testName}: Found ${pageMatches.length} page citations: ${pageMatches.slice(0, 3).join(', ')}`)
        
        // Verify pages are not 0
        const nonZeroPages = pageMatches.filter(match => !match.includes('[Page 0]'))
        if (nonZeroPages.length > 0) {
          console.log(`✅ ${testName}: Non-zero page citations confirmed`)
        } else {
          console.log(`❌ ${testName}: All citations are [Page 0] - page mapping issue`)
        }
      } else {
        console.log(`❌ ${testName}: No page citations found`)
      }

      return { response: fullResponse, citations: pageMatches }
      
    } catch (error) {
      console.error(`💥 ${testName} error:`, error.message)
    }
  }

  // Run the three smoke tests
  await testChatWithStreaming(
    "Give me the top 3 financial risks.",
    "Test 1: Financial Risks"
  )

  await testChatWithStreaming(
    "What is the Year-1 NOI?",
    "Test 2: Year-1 NOI"
  )

  await testChatWithStreaming(
    "Summarize the rent roll.",
    "Test 3: Rent Roll Summary"
  )

  console.log('\n🏁 Conversational chat smoke tests completed!')
}

// Allow script to be run with document ID parameter
const args = process.argv.slice(2)
if (args.length > 0) {
  process.env.TEST_DOCUMENT_ID = args[0]
}

testConversationalChat().catch(console.error)