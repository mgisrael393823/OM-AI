import React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { StatsBar } from '@/components/ui/stats-bar'
import { componentTypography, typography } from '@/lib/typography'
import { cn } from '@/lib/utils'
import { Zap } from 'lucide-react'

const trustStats = [
  { value: '2,000+', label: 'CRE professionals' },
  { value: '50,000+', label: 'OMs analyzed' },
  { value: 'SOC 2', label: 'Compliant' }
]

export function HeroSection() {
  return (
    <section className="py-20 lg:py-32">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-4xl text-center">
          <div className="flex flex-col items-center gap-6">
            {/* Badge */}
            <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-full">
              <Zap className="w-4 h-4" />
              <span className={typography.caption}>AI-Powered Analysis</span>
            </div>
            
            {/* Headlines */}
            <div className="space-y-4">
              <h1 className={cn('tracking-tight text-slate-900 dark:text-white', typography.pageTitle)}>
                Analyze Offering Memorandums in{' '}
                <span className="bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
                  Minutes, Not Hours
                </span>
              </h1>
              
              <p className={cn('text-slate-600 dark:text-slate-300 max-w-2xl mx-auto', typography.bodyLarge)}>
                AI-powered CRE analysis that extracts key metrics, evaluates deals, and answers complex questions instantly
              </p>
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 items-center">
              <Link href="/auth/register">
                <Button 
                  size="lg"
                  className={cn('px-8 py-3', componentTypography.button.primary)}
                >
                  Start Free 7-Day Trial
                </Button>
              </Link>
              
              <Button 
                variant="outline" 
                size="lg"
                className={cn('px-8 py-3', componentTypography.button.secondary)}
              >
                Watch 2-Min Demo
              </Button>
            </div>

            {/* Trust Bar */}
            <div className="mt-8 pt-8 border-t border-border/50">
              <StatsBar 
                stats={trustStats}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

