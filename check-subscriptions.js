require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkSubscriptions() {
  try {
    console.log('Checking subscriptions table...')
    
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5)
    
    if (error) {
      if (error.code === '42P01') {
        console.log('❌ Subscriptions table does not exist')
        console.log('Run the migration: npx supabase db push --include-all')
        return
      }
      console.error('Error querying subscriptions:', error)
      return
    }
    
    console.log('✅ Subscriptions table exists')
    console.log('Recent subscriptions:', data.length, 'found')
    
    if (data.length > 0) {
      data.forEach((sub, i) => {
        console.log(`${i + 1}. User: ${sub.user_id}`)
        console.log(`   Status: ${sub.status}`)
        console.log(`   Tier: ${sub.tier}`)
        console.log(`   Stripe Customer: ${sub.stripe_customer_id}`)
        console.log(`   Created: ${sub.created_at}`)
        console.log('')
      })
    } else {
      console.log('No subscriptions found')
      console.log('Check webhook logs in your terminal running "stripe listen"')
    }
  } catch (err) {
    console.error('Error:', err)
  }
}

checkSubscriptions()