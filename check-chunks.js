require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkChunks() {
  console.log('Checking total chunk count in database...')
  const { count, error } = await supabase
    .from('document_chunks')
    .select('*', { count: 'exact', head: true })
  
  if (error) {
    console.error('Error:', error)
    return
  }
  
  console.log('Total chunks in database:', count)

  if (count > 0) {
    const { data: sampleChunks, error: sampleError } = await supabase
      .from('document_chunks')
      .select('document_id, chunk_type, page_number')
      .limit(5)
    
    if (!sampleError && sampleChunks) {
      console.log('\nSample chunks:')
      sampleChunks.forEach(chunk => {
        console.log(`- Document: ${chunk.document_id}, Type: ${chunk.chunk_type}, Page: ${chunk.page_number}`)
      })
    }

    // Check for Tampa documents specifically
    console.log('\nChecking for Tampa document chunks...')
    const { data: tampaChunks, error: tampaError } = await supabase
      .from('document_chunks')
      .select('document_id, COUNT(*)')
      .in('document_id', [
        'e5c2ce6e-71ae-4f5a-8890-5af73e4794b2',
        '66888b45-6845-446e-9363-c0b570665e23', 
        '09eb53b9-62e6-457c-bc15-70a812789a68',
        'b49717fb-a681-4453-b486-5eec0227ee51'
      ])
    
    if (!tampaError) {
      console.log('Tampa chunks:', tampaChunks)
    }
  } else {
    console.log('No chunks found in the database at all.')
  }
}

checkChunks()