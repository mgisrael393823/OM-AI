require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkColumns() {
  try {
    // Try to select all columns to see what exists
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .limit(1)
    
    if (error) {
      console.error('Error selecting from subscriptions:', error)
      return
    }
    
    console.log('Subscriptions table exists and is accessible')
    
    // Try to insert a minimal record to see what columns are required/missing
    const testInsert = {
      user_id: '00000000-0000-0000-0000-000000000000', // dummy UUID
      tier: 'free',
      status: 'incomplete'
    }
    
    const { data: insertData, error: insertError } = await supabase
      .from('subscriptions')
      .insert(testInsert)
      .select()
    
    if (insertError) {
      console.error('Insert error (this will show us what columns are missing):')
      console.error(insertError)
    } else {
      console.log('Test insert successful:', insertData)
      
      // Clean up test record
      await supabase
        .from('subscriptions')
        .delete()
        .eq('user_id', '00000000-0000-0000-0000-000000000000')
    }
    
  } catch (err) {
    console.error('Error:', err)
  }
}

checkColumns()