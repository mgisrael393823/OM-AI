import React from 'react'
import { LucideIcon } from 'lucide-react'
import { typography, componentTypography } from '@/lib/typography'
import { cn } from '@/lib/utils'

interface StepCardProps {
  step: number
  icon: LucideIcon
  title: string
  description: string
  className?: string
}

export function StepCard({ step, icon: Icon, title, description, className }: StepCardProps) {
  return (
    <div className={cn(
      'text-center p-6 rounded-lg bg-white/80 backdrop-blur-sm dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700',
      className
    )}>
      <div className="flex flex-col items-center gap-4">
        {/* Step number and icon */}
        <div className="relative">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <Icon className="w-8 h-8 text-primary" />
          </div>
          <div className={cn('absolute -top-2 -right-2 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center', typography.caption, 'font-bold')}>
            {step}
          </div>
        </div>
        
        {/* Content */}
        <div className="space-y-2">
          <h3 className={cn('text-slate-900 dark:text-white', componentTypography.card.title)}>
            {title}
          </h3>
          <p className={cn('text-slate-600 dark:text-slate-300', componentTypography.card.content)}>
            {description}
          </p>
        </div>
      </div>
    </div>
  )
}