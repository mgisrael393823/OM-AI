require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkDocumentStatus() {
  const { data: tampaDoc, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', 'e5c2ce6e-71ae-4f5a-8890-5af73e4794b2')
    .single()
  
  if (error) {
    console.error('Error:', error)
  } else {
    console.log('Tampa document details:')
    console.log('Status:', tampaDoc.status)
    console.log('Processed at:', tampaDoc.processed_at)
    console.log('Metadata:', JSON.stringify(tampaDoc.metadata, null, 2))
    console.log('Has extracted_text:', !!tampaDoc.extracted_text)
    if (tampaDoc.extracted_text) {
      console.log('Text length:', tampaDoc.extracted_text.length)
      console.log('First 500 chars:', tampaDoc.extracted_text.substring(0, 500))
    }
  }
}

checkDocumentStatus()