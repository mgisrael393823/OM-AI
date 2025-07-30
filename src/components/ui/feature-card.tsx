import React from 'react'
import { LucideIcon } from 'lucide-react'
import { componentTypography, typography } from '@/lib/typography'
import { cn } from '@/lib/utils'

interface FeatureCardProps {
  icon: LucideIcon
  title: string
  description: string
  variant?: 'primary' | 'secondary' | 'accent'
  className?: string
}

const variantStyles = {
  primary: 'bg-primary/10 text-primary',
  secondary: 'bg-secondary/10 text-secondary-foreground',
  accent: 'bg-accent/10 text-accent-foreground'
}

export function FeatureCard({ 
  icon: Icon, 
  title, 
  description, 
  variant = 'primary',
  className 
}: FeatureCardProps) {
  return (
    <div className={cn(
      'p-6 bg-white/80 backdrop-blur-sm dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700',
      className
    )}>
      <div className="grid grid-cols-1 gap-4">
        <div className={cn('h-10 w-10 rounded-lg grid grid-cols-1 justify-items-center items-center', variantStyles[variant])}>
          <Icon className="w-5 h-5" />
        </div>
        <h3 className={cn('text-slate-900 dark:text-white', componentTypography.card.title)}>
          {title}
        </h3>
        <p className={cn('text-slate-600 dark:text-slate-300', componentTypography.card.content)}>
          {description}
        </p>
      </div>
    </div>
  )
}