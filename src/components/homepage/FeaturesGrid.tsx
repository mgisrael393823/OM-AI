import React from 'react'
import { FeatureCard } from '@/components/ui/feature-card'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'
import { FileSearch, Calculator, MessageSquare, BarChart3, Users, FileText } from 'lucide-react'

const features = [
  {
    icon: FileSearch,
    title: 'Intelligent Data Extraction',
    description: 'Automatically extract and categorize 50+ key metrics from any OM format.',
    variant: 'primary' as const
  },
  {
    icon: Calculator,
    title: 'Financial Modeling',
    description: 'Generate comprehensive financial models with cash flow projections and returns analysis.',
    variant: 'secondary' as const
  },
  {
    icon: MessageSquare,
    title: 'Natural Language Analysis',
    description: 'Ask complex questions about deals and get detailed, cited responses instantly.',
    variant: 'accent' as const
  },
  {
    icon: BarChart3,
    title: 'Comp Analysis',
    description: 'Compare deals against market comps and historical performance data.',
    variant: 'primary' as const
  },
  {
    icon: Users,
    title: 'Team Collaboration',
    description: 'Share insights, add comments, and collaborate with your team in real-time.',
    variant: 'secondary' as const
  },
  {
    icon: FileText,
    title: 'Professional Reports',
    description: 'Generate investor-ready reports and presentations with one click.',
    variant: 'accent' as const
  }
]

export function FeaturesGrid() {
  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className={cn('tracking-tight text-slate-900 dark:text-white mb-4', typography.sectionHeader)}>
            Everything You Need for CRE Deal Analysis
          </h2>
          <p className={cn('text-slate-600 dark:text-slate-300 max-w-2xl mx-auto', typography.bodyLarge)}>
            Purpose-built for commercial real estate professionals
          </p>
        </div>
        
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <FeatureCard
                key={index}
                icon={feature.icon}
                title={feature.title}
                description={feature.description}
                variant={feature.variant}
                className="hover:shadow-lg transition-shadow duration-300"
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}