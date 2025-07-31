require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkTableSchema() {
  try {
    // Get table columns from information_schema
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'subscriptions' 
        AND table_schema = 'public'
        ORDER BY ordinal_position;
      `
    })
    
    if (error) {
      console.error('Error:', error)
      return
    }
    
    console.log('Subscriptions table columns:')
    data.forEach(col => {
      console.log(`- ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`)
    })
  } catch (err) {
    console.error('Error:', err)
  }
}

checkTableSchema()