require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkRealCheckout() {
  try {
    console.log('Checking for your real checkout session: cs_test_b1zz1Cd4qzzG0X9qaEnz00Et6pnkOahhX1GekOTflvDWtD7u15nFSmLVh5')
    
    // Check if there were any subscriptions created around the time of your real checkout
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .gte('created_at', '2025-01-30T22:00:00.000Z') // Around when you did the real checkout
    
    if (error) {
      console.error('Error:', error)
      return
    }
    
    console.log('Subscriptions created since your real checkout:', data.length)
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
      console.log('No subscriptions found from your real checkout')
      console.log('This means the real checkout webhook may have failed too')
    }
  } catch (err) {
    console.error('Error:', err)
  }
}

checkRealCheckout()