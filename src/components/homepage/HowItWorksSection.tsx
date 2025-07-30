import React from 'react'
import { StepCard } from '@/components/ui/step-card'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'
import { Upload, Sparkles, MessageCircle } from 'lucide-react'

const steps = [
  {
    step: 1,
    icon: Upload,
    title: 'Upload Your OM',
    description: 'Drag & drop any PDF, Word, or Excel file.'
  },
  {
    step: 2,
    icon: Sparkles,
    title: 'AI Extracts Everything',
    description: '50+ metrics extracted instantly.'
  },
  {
    step: 3,
    icon: MessageCircle,
    title: 'Ask Anything',
    description: 'Get detailed answers with source citations.'
  }
]

export function HowItWorksSection() {
  return (
    <section className="py-20 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className={cn('tracking-tight text-slate-900 dark:text-white mb-4', typography.sectionHeader)}>
            From Upload to Insights in 3 Simple Steps
          </h2>
        </div>
        
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((step) => (
              <StepCard
                key={step.step}
                step={step.step}
                icon={step.icon}
                title={step.title}
                description={step.description}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}