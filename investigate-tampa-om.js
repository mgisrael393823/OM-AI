require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function investigateTampaOM() {
  console.log('=== INVESTIGATING X TAMPA OM DOCUMENT PROCESSING ===\n')

  try {
    // 1. Search for documents with "Tampa" in the filename
    console.log('1. Searching for X Tampa OM document in documents table...')
    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('*')
      .ilike('original_filename', '%Tampa%')

    if (docsError) {
      console.error('Error searching documents:', docsError)
      return
    }

    if (!documents || documents.length === 0) {
      console.log('❌ No documents found with "Tampa" in the filename')
      
      // Check all documents to see what's available
      const { data: allDocs, error: allError } = await supabase
        .from('documents')
        .select('id, original_filename, status, created_at')
        .order('created_at', { ascending: false })
        .limit(10)

      if (!allError && allDocs?.length > 0) {
        console.log('\nRecent documents in the database:')
        allDocs.forEach(doc => {
          console.log(`- ${doc.original_filename} (${doc.status}) - ${doc.created_at}`)
        })
      }
      
      // Also check if the function exists
      console.log('\nChecking if search_document_chunks function exists...')
      const { error: funcError } = await supabase.rpc('search_document_chunks', {
        p_user_id: '00000000-0000-0000-0000-000000000000',
        p_document_ids: [],
        p_query: 'test',
        p_limit: 1
      })
      
      if (funcError) {
        console.log('❌ search_document_chunks function error:', funcError.message)
      } else {
        console.log('✅ search_document_chunks function exists and callable')
      }
      
      return
    }

    console.log(`✅ Found ${documents.length} Tampa document(s):`)
    documents.forEach(doc => {
      console.log(`- ID: ${doc.id}`)
      console.log(`- Filename: ${doc.original_filename}`)
      console.log(`- Status: ${doc.status}`)
      console.log(`- File Size: ${doc.file_size} bytes`)
      console.log(`- Created: ${doc.created_at}`)
      console.log(`- User ID: ${doc.user_id}`)
      console.log('')
    })

    const tampaDoc = documents[0]

    // 2. Check document_chunks for this document
    console.log('2. Examining document_chunks for Tampa OM...')
    const { data: chunks, error: chunksError } = await supabase
      .from('document_chunks')
      .select('*')
      .eq('document_id', tampaDoc.id)
      .order('page_number')

    if (chunksError) {
      console.error('Error fetching chunks:', chunksError)
      return
    }

    if (!chunks || chunks.length === 0) {
      console.log('❌ No chunks found for this document')
      return
    }

    console.log(`✅ Found ${chunks.length} chunks for Tampa OM`)
    console.log(`- Page range: ${Math.min(...chunks.map(c => c.page_number))} to ${Math.max(...chunks.map(c => c.page_number))}`)
    console.log(`- Chunk types: ${[...new Set(chunks.map(c => c.chunk_type))].join(', ')}`)
    console.log('')

    // 3. Test search_document_chunks RPC with "key deal points" query
    console.log('3. Testing search_document_chunks RPC with "key deal points" query...')
    const { data: searchResults, error: searchError } = await supabase.rpc('search_document_chunks', {
      p_user_id: tampaDoc.user_id,
      p_document_ids: [tampaDoc.id],
      p_query: 'key deal points',
      p_limit: 10
    })

    if (searchError) {
      console.error('Error in search function:', searchError)
      return
    }

    console.log(`✅ Search returned ${searchResults?.length || 0} results`)
    if (searchResults && searchResults.length > 0) {
      searchResults.forEach((result, index) => {
        console.log(`\nResult ${index + 1}:`)
        console.log(`- Page: ${result.page_number}`)
        console.log(`- Type: ${result.chunk_type}`)
        console.log(`- Content preview: ${result.content.substring(0, 200)}...`)
      })
    }

    // 4. Search for specific financial terms in chunk content
    console.log('\n4. Searching for financial terms in chunk content...')
    const financialTerms = ['IRR', 'NOI', 'Equity Multiple', 'Cap Rate', 'Cash Flow', 'Return', 'Purchase Price', 'Acquisition']
    
    for (const term of financialTerms) {
      const { data: termResults, error: termError } = await supabase
        .from('document_chunks')
        .select('page_number, chunk_type, content')
        .eq('document_id', tampaDoc.id)
        .ilike('content', `%${term}%`)
        .limit(3)

      if (!termError && termResults && termResults.length > 0) {
        console.log(`\n✅ Found "${term}" in ${termResults.length} chunks:`)
        termResults.forEach(chunk => {
          const termIndex = chunk.content.toLowerCase().indexOf(term.toLowerCase())
          const start = Math.max(0, termIndex - 50)
          const end = Math.min(chunk.content.length, termIndex + 100)
          const context = chunk.content.substring(start, end)
          console.log(`- Page ${chunk.page_number}: ...${context}...`)
        })
      } else {
        console.log(`❌ No chunks found containing "${term}"`)
      }
    }

    // 5. Sample chunk content from different pages
    console.log('\n5. Sample chunk content from different pages:')
    const samplePages = [1, 2, 3, Math.floor(chunks.length / 2)]
    
    for (const pageNum of samplePages) {
      const pageChunks = chunks.filter(c => c.page_number === pageNum)
      if (pageChunks.length > 0) {
        console.log(`\nPage ${pageNum} (${pageChunks.length} chunks):`)
        pageChunks.slice(0, 2).forEach((chunk, idx) => {
          console.log(`- Chunk ${idx + 1} (${chunk.chunk_type}): ${chunk.content.substring(0, 150)}...`)
        })
      }
    }

  } catch (err) {
    console.error('Unexpected error:', err)
  }
}

investigateTampaOM()