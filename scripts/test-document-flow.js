#!/usr/bin/env node

/**
 * Test the complete document upload -> chat flow to identify where it breaks
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// Local Supabase configuration
const SUPABASE_URL = 'http://127.0.0.1:54321'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SUPABASE_SERVICE_ROLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const GUEST_EMAIL = 'guest@om-ai.dev'
const GUEST_PASSWORD = 'guestpass123'

async function testDocumentFlow() {
  console.log('🔬 Testing Document Upload -> Chat Flow\n')

  // Step 1: Login as guest user
  console.log('1️⃣ Logging in as guest user...')
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

  // Step 2: Check existing documents 
  console.log('\n2️⃣ Checking existing documents...')
  const { data: existingDocs, error: docsError } = await supabase
    .from('documents')
    .select('id, original_filename, status, created_at')
    .eq('user_id', authData.user.id)

  if (docsError) {
    console.error('❌ Error fetching documents:', docsError)
    return
  }

  console.log(`📄 Found ${existingDocs.length} existing documents:`)
  existingDocs.forEach((doc, i) => {
    console.log(`   ${i + 1}. ${doc.original_filename} (${doc.status}) - ${doc.id}`)
  })

  // Step 3: Test document context retrieval for each document
  for (const doc of existingDocs) {
    console.log(`\n3️⃣ Testing document context for: ${doc.original_filename}`)
    
    // Check if document has chunks
    const { data: chunks, error: chunksError } = await supabase
      .from('document_chunks')
      .select('id, content, page_number, chunk_type')
      .eq('document_id', doc.id)
      .limit(3)

    if (chunksError) {
      console.error(`❌ Error fetching chunks for ${doc.id}:`, chunksError)
      continue
    }

    console.log(`   📝 Found ${chunks.length} chunks`)
    if (chunks.length === 0) {
      console.log(`   ⚠️ No chunks found for document ${doc.id}`)
      continue
    }

    chunks.forEach((chunk, i) => {
      console.log(`     ${i + 1}. Page ${chunk.page_number}: ${chunk.content.slice(0, 100)}...`)
    })

    // Step 4: Test the retrieveTopK function simulation
    console.log(`\n4️⃣ Testing document retrieval for ${doc.original_filename}...`)
    
    // Use service role client to test RPC function
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE)
    
    try {
      const { data: rpcResult, error: rpcError } = await adminClient.rpc('search_document_chunks', {
        p_document_ids: [doc.id],
        p_query: 'property value income',
        p_limit: 5
      })

      if (rpcError) {
        console.log(`   ⚠️ RPC search failed: ${rpcError.message}`)
        
        // Test fallback query
        const { data: fallbackResult, error: fallbackError } = await adminClient
          .from('document_chunks')
          .select('content,page_number,chunk_type')
          .eq('document_id', doc.id)
          .ilike('content', '%property%')
          .limit(3)

        if (fallbackError) {
          console.log(`   ❌ Fallback query failed: ${fallbackError.message}`)
        } else {
          console.log(`   ✅ Fallback found ${fallbackResult.length} chunks`)
        }
      } else {
        console.log(`   ✅ RPC search found ${rpcResult.length} chunks`)
      }
    } catch (err) {
      console.log(`   ❌ Search error: ${err.message}`)
    }

    // Step 5: Test chat API with document context
    console.log(`\n5️⃣ Testing chat API with document ${doc.id}...`)
    
    try {
      const response = await fetch('http://127.0.0.1:3000/api/chat', {
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
            documentId: doc.id
          }
        })
      })

      const chatResult = await response.json()
      
      if (!response.ok) {
        console.log(`   ❌ Chat API failed (${response.status}): ${chatResult.error || chatResult.message}`)
        console.log(`   Code: ${chatResult.code}`)
        if (chatResult.details) {
          console.log(`   Details:`, chatResult.details)
        }
      } else {
        console.log(`   ✅ Chat API succeeded: ${chatResult.message?.slice(0, 100)}...`)
      }
    } catch (err) {
      console.log(`   ❌ Chat API request failed: ${err.message}`)
    }
  }

  console.log('\n🏁 Document flow test completed!')
}

testDocumentFlow().catch(console.error)