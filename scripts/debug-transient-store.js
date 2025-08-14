#!/usr/bin/env node

/**
 * Test the transient store directly to see what's stored
 */

// Simulate what happens during document processing
console.log('🔍 Testing transient store behavior...\n')

// Create a simple test to understand the issue
const testDocumentFlow = async () => {
  // Test 1: Check if process-pdf-memory endpoint returns proper requestId
  console.log('1️⃣ Testing document upload endpoint...')
  
  try {
    const response = await fetch('http://127.0.0.1:3000/api/health')
    const health = await response.json()
    console.log('   Server health:', health.status)
    
    if (health.status !== 'healthy') {
      console.error('❌ Server not healthy')
      return
    }
  } catch (error) {
    console.error('❌ Server not reachable:', error.message)
    return
  }

  // Test 2: Simulate the document context issue
  console.log('\n2️⃣ Simulating document context retrieval...')
  
  // The issue is likely that when a user uploads a document and immediately chats,
  // the frontend is using the requestId from upload but the backend isn't finding it
  
  const potentialIssues = [
    'Document not stored in transient store during upload',
    'Frontend sending wrong document ID format',
    'Transient store not being checked by retrieveTopK',
    'Document chunks not properly formatted in transient store'
  ]
  
  console.log('   Potential issues to investigate:')
  potentialIssues.forEach((issue, i) => {
    console.log(`     ${i + 1}. ${issue}`)
  })

  console.log('\n3️⃣ Next steps:')
  console.log('   - Check browser dev tools network tab for document upload response')
  console.log('   - Check if document ID in chat request matches upload response')
  console.log('   - Verify transient store is populated during upload')
  console.log('   - Check server logs for retrieveTopK calls')
}

testDocumentFlow().catch(console.error)