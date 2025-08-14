#!/usr/bin/env node

/**
 * Create a test document directly in the database for testing
 */

const { createClient } = require('@supabase/supabase-js')

// Local Supabase configuration
const SUPABASE_URL = 'http://127.0.0.1:54321'
const SUPABASE_SERVICE_ROLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const GUEST_USER_ID = '976375e0-06bd-4335-9d02-e09beda987d8'

async function createTestDocument() {
  console.log('📄 Creating test document and chunks...')

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE)

  try {
    // Create a test document
    const { data: document, error: docError } = await supabase
      .from('documents')
      .insert({
        user_id: GUEST_USER_ID,
        filename: 'test-document.pdf',
        original_filename: 'Test Commercial Property OM.pdf',
        file_size: 1024000,
        file_type: 'application/pdf',
        status: 'completed',
        storage_path: 'test/test-document.pdf',
        extracted_text: 'Sample commercial real estate offering memorandum content...',
        metadata: {
          pageCount: 5,
          validation: { isValid: true }
        }
      })
      .select()
      .single()

    if (docError) {
      console.error('❌ Error creating document:', docError)
      return
    }

    console.log('✅ Document created:', document.id)

    // Create test chunks
    const chunks = [
      {
        document_id: document.id,
        user_id: GUEST_USER_ID,
        chunk_id: 'chunk-1',
        chunk_index: 0,
        content: 'This commercial property offers a net operating income of $500,000 annually with a cap rate of 6.5%. The property is located in downtown Tampa and features 50,000 square feet of office space.',
        page_number: 1,
        chunk_type: 'paragraph'
      },
      {
        document_id: document.id,
        user_id: GUEST_USER_ID,
        chunk_id: 'chunk-2', 
        chunk_index: 1,
        content: 'Financial projections show strong performance with gross rental income of $750,000 and operating expenses of $250,000. The investment opportunity includes potential for value-add improvements.',
        page_number: 2,
        chunk_type: 'paragraph'
      },
      {
        document_id: document.id,
        user_id: GUEST_USER_ID,
        chunk_id: 'chunk-3',
        chunk_index: 2,
        content: 'Property details include modern amenities, elevator access, and parking for 200 vehicles. Located in prime business district with excellent access to major highways and public transportation.',
        page_number: 3,
        chunk_type: 'paragraph'
      }
    ]

    const { data: chunksData, error: chunksError } = await supabase
      .from('document_chunks')
      .insert(chunks)
      .select()

    if (chunksError) {
      console.error('❌ Error creating chunks:', chunksError)
      return
    }

    console.log(`✅ Created ${chunksData.length} document chunks`)

    console.log('\n📋 Test Document Details:')
    console.log('   Document ID:', document.id)
    console.log('   User ID:', GUEST_USER_ID)
    console.log('   Filename:', document.original_filename)
    console.log('   Chunks:', chunksData.length)

    return {
      documentId: document.id,
      chunks: chunksData
    }

  } catch (error) {
    console.error('💥 Error:', error)
  }
}

createTestDocument().catch(console.error)