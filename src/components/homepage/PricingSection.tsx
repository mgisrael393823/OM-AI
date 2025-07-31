import React, { useState } from 'react'
import { Check, X } from 'lucide-react'
import { typography, componentTypography } from '@/lib/typography'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/router'
import { PRICING_PLANS } from '@/lib/pricing-config'
import { supabase } from '@/lib/supabase'

const pricingTiers = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$99',
    period: '/month',
    description: 'Perfect for individual analysts',
    features: [
      { text: '10 OM analyses per month', included: true },
      { text: 'Core financial metrics extraction', included: true },
      { text: 'Basic AI chat assistance', included: true },
      { text: 'Email support', included: true },
      { text: 'Advanced analytics', included: false },
      { text: 'API access', included: false },
    ],
    cta: 'Start Free Trial',
    highlighted: false
  },
  {
    id: 'professional',
    name: 'Professional',
    price: '$299',
    period: '/month',
    description: 'For teams and power users',
    features: [
      { text: 'Unlimited OM analyses', included: true },
      { text: 'Advanced financial modeling', included: true },
      { text: 'Full AI chat capabilities', included: true },
      { text: 'Priority support', included: true },
      { text: 'Custom report templates', included: true },
      { text: 'API access (1000 calls/month)', included: true },
    ],
    cta: 'Start Free Trial',
    highlighted: true
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For large organizations',
    features: [
      { text: 'Everything in Professional', included: true },
      { text: 'Unlimited API access', included: true },
      { text: 'Custom integrations', included: true },
      { text: 'Dedicated account manager', included: true },
      { text: 'SLA guarantee', included: true },
      { text: 'On-premise deployment option', included: true },
    ],
    cta: 'Contact Sales',
    highlighted: false
  }
]

export function PricingSection() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState<string | null>(null)

  const handleCheckout = async (planId: string) => {
    if (planId === 'enterprise') {
      router.push('/contact')
      return
    }

    setIsLoading(planId)
    
    try {
      const plan = PRICING_PLANS[planId as keyof typeof PRICING_PLANS]
      
      // Get current session token
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        router.push(`/auth/login?redirect=/pricing&plan=${planId}`)
        return
      }
      
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          priceId: plan.priceId,
          planType: planId,
        }),
      })

      const data = await response.json()

      if (data.error) {
        // If not authenticated, redirect to login
        if (response.status === 401) {
          router.push(`/auth/login?redirect=/pricing&plan=${planId}`)
        } else {
          console.error('Checkout error:', data.error)
          alert('Failed to start checkout. Please try again.')
        }
        return
      }

      // Redirect to Stripe checkout
      window.location.href = data.url
    } catch (error) {
      console.error('Checkout error:', error)
      alert('Failed to start checkout. Please try again.')
    } finally {
      setIsLoading(null)
    }
  }

  return (
    <section className="py-20 bg-slate-50 dark:bg-slate-900/50">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className={cn('tracking-tight text-slate-900 dark:text-white mb-4', typography.sectionHeader)}>
              Simple, Transparent Pricing
            </h2>
            <p className={cn('text-slate-600 dark:text-slate-300', typography.bodyLarge)}>
              Choose the plan that fits your needs. No hidden fees.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {pricingTiers.map((tier) => (
              <div
                key={tier.name}
                className={cn(
                  'relative rounded-2xl p-6 sm:p-8',
                  tier.highlighted
                    ? 'bg-primary text-primary-foreground shadow-2xl lg:scale-105'
                    : 'bg-white dark:bg-slate-800 shadow-xl'
                )}
              >
                {tier.highlighted && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className={cn('bg-secondary text-secondary-foreground px-3 py-1 rounded-full text-xs', typography.caption)}>
                      MOST POPULAR
                    </span>
                  </div>
                )}

                <div className="text-center mb-8">
                  <h3 className={cn(
                    'mb-2',
                    tier.highlighted ? 'text-primary-foreground' : 'text-slate-900 dark:text-white',
                    componentTypography.card.title
                  )}>
                    {tier.name}
                  </h3>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className={cn('text-3xl sm:text-4xl font-bold', typography.pageTitle)}>
                      {tier.price}
                    </span>
                    {tier.period && (
                      <span className={cn(
                        tier.highlighted ? 'text-primary-foreground/80' : 'text-slate-600 dark:text-slate-400',
                        typography.body
                      )}>
                        {tier.period}
                      </span>
                    )}
                  </div>
                  <p className={cn(
                    'mt-3',
                    tier.highlighted ? 'text-primary-foreground/90' : 'text-slate-600 dark:text-slate-400',
                    typography.body
                  )}>
                    {tier.description}
                  </p>
                </div>

                <ul className="space-y-4 mb-8">
                  {tier.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-3">
                      {feature.included ? (
                        <Check className={cn(
                          'w-5 h-5 flex-shrink-0',
                          tier.highlighted ? 'text-primary-foreground' : 'text-green-500'
                        )} />
                      ) : (
                        <X className={cn(
                          'w-5 h-5 flex-shrink-0',
                          tier.highlighted ? 'text-primary-foreground/50' : 'text-slate-400'
                        )} />
                      )}
                      <span className={cn(
                        feature.included
                          ? tier.highlighted ? 'text-primary-foreground' : 'text-slate-700 dark:text-slate-300'
                          : tier.highlighted ? 'text-primary-foreground/60' : 'text-slate-400 dark:text-slate-500',
                        typography.body
                      )}>
                        {feature.text}
                      </span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleCheckout(tier.id)}
                  disabled={isLoading === tier.id}
                  className={cn(
                    'block w-full text-center px-4 sm:px-6 py-2 sm:py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                    tier.highlighted
                      ? 'bg-white text-primary hover:bg-slate-100'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90',
                    componentTypography.button.primary
                  )}
                >
                  {isLoading === tier.id ? 'Loading...' : tier.cta}
                </button>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <p className={cn('text-slate-600 dark:text-slate-400', typography.body)}>
              All plans include a 14-day free trial. No credit card required.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}