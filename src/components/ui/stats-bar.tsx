import React from 'react'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'

interface Stat {
  value: string
  label: string
}

interface StatsBarProps {
  stats: Stat[]
  className?: string
}

export function StatsBar({ stats, className }: StatsBarProps) {
  return (
    <div className={cn(
      'flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 text-center',
      className
    )}>
      {stats.map((stat, index) => (
        <div key={index} className="flex items-center gap-2">
          {index > 0 && (
            <div className="hidden sm:block w-px h-4 bg-border" />
          )}
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
            <span className={cn('font-semibold text-foreground', typography.emphasis)}>
              {stat.value}
            </span>
            <span className={cn('text-muted-foreground', typography.bodySmall)}>
              {stat.label}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}