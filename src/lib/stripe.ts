import Stripe from 'stripe'

// Only initialize Stripe on the server side
let stripe: Stripe | null = null

if (typeof window === 'undefined') {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('Missing STRIPE_SECRET_KEY environment variable')
  }
  
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-12-18.acacia',
    typescript: true,
  })
}

export { stripe }

// Re-export pricing configuration
export { PRICING_PLANS, type PlanType } from './pricing-config'