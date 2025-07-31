// Pricing configuration that can be used on both client and server
export const PRICING_PLANS = {
  starter: {
    name: 'Starter',
    productId: 'prod_SmGKwmagHaOsqa',
    priceId: 'price_1RqhoIAlStZOHfNq2PLqRNub',
    price: 99,
    currency: 'usd',
    interval: 'month' as const,
    features: [
      '10 OM analyses per month',
      'Core financial metrics extraction',
      'Basic AI chat assistance',
      'Email support',
    ],
  },
  professional: {
    name: 'Professional',
    productId: 'prod_SmGLiyfw14EKha',
    priceId: 'price_1RqhooAlStZOHfNqD3oibokM',
    price: 299,
    currency: 'usd',
    interval: 'month' as const,
    features: [
      'Unlimited OM analyses',
      'Advanced financial modeling',
      'Full AI chat capabilities',
      'Priority support',
      'Custom report templates',
      'API access (1000 calls/month)',
    ],
  },
  enterprise: {
    name: 'Enterprise',
    productId: 'prod_SmGL2506L3rXDe',
    priceId: 'price_1RqhpAAlStZOHfNqg0DIektC',
    price: 999, // Placeholder price
    currency: 'usd',
    interval: 'month' as const,
    features: [
      'Everything in Professional',
      'Unlimited API access',
      'Custom integrations',
      'Dedicated account manager',
      'SLA guarantee',
      'On-premise deployment option',
    ],
  },
} as const

export type PlanType = keyof typeof PRICING_PLANS