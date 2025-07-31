import { NextApiRequest, NextApiResponse } from 'next'
import { stripe } from '@/lib/stripe'
import { createClient } from '@supabase/supabase-js'
import { buffer } from 'micro'

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

// Disable body parsing for raw payload
export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!stripe) {
    return res.status(500).json({ error: 'Stripe not initialized' })
  }

  try {
    const buf = await buffer(req)
    const signature = req.headers['stripe-signature'] as string

    let event

    try {
      event = stripe.webhooks.constructEvent(buf, signature, webhookSecret)
    } catch (err) {
      console.error('Webhook signature verification failed:', err)
      return res.status(400).json({
        error: 'Webhook signature verification failed'
      })
    }

    // Create Supabase client with service role key for webhook operations
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    )

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        console.log('Checkout session completed:', session)
        
        if (session.mode === 'subscription' && session.subscription) {
          // Get the subscription details
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string
          )
          
          const userId = session.metadata?.user_id
          const planType = session.metadata?.plan_type
          
          if (userId && planType) {
            // Update user's subscription in database
            const { error } = await supabase
              .from('subscriptions')
              .upsert({
                user_id: userId,
                stripe_customer_id: session.customer as string,
                stripe_subscription_id: subscription.id,
                stripe_price_id: subscription.items.data[0].price.id,
                status: subscription.status as any,
                tier: planType as any,
                current_period_start: subscription.current_period_start 
                  ? new Date(subscription.current_period_start * 1000).toISOString() 
                  : new Date().toISOString(),
                current_period_end: subscription.current_period_end 
                  ? new Date(subscription.current_period_end * 1000).toISOString()
                  : subscription.trial_end 
                    ? new Date(subscription.trial_end * 1000).toISOString()
                    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
              })
              
            if (error) {
              console.error('Error updating subscription:', error)
            }
          }
        }
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object
        console.log('Subscription created/updated:', subscription)
        
        const userId = subscription.metadata?.user_id
        const planType = subscription.metadata?.plan_type
        
        if (userId) {
          const { error } = await supabase
            .from('subscriptions')
            .upsert({
              user_id: userId,
              stripe_customer_id: subscription.customer as string,
              stripe_subscription_id: subscription.id,
              stripe_price_id: subscription.items.data[0].price.id,
              status: subscription.status as any,
              tier: planType as any,
              current_period_start: subscription.current_period_start 
                ? new Date(subscription.current_period_start * 1000).toISOString() 
                : new Date().toISOString(),
              current_period_end: subscription.current_period_end 
                ? new Date(subscription.current_period_end * 1000).toISOString()
                : subscription.trial_end 
                  ? new Date(subscription.trial_end * 1000).toISOString()
                  : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
            })
            
          if (error) {
            console.error('Error updating subscription:', error)
          }
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object
        console.log('Subscription cancelled:', subscription)
        
        const userId = subscription.metadata?.user_id
        
        if (userId) {
          const { error } = await supabase
            .from('subscriptions')
            .update({
              status: 'canceled',
              canceled_at: new Date().toISOString(),
            })
            .eq('stripe_subscription_id', subscription.id)
            
          if (error) {
            console.error('Error updating canceled subscription:', error)
          }
        }
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object
        console.log('Payment succeeded:', invoice)
        
        // TODO: Record successful payment
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object
        console.log('Payment failed:', invoice)
        
        // TODO: Handle failed payment (send email, retry, etc.)
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return res.status(200).json({ received: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return res.status(500).json({
      error: 'Webhook handler failed'
    })
  }
}