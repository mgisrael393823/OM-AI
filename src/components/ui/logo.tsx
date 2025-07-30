import React from 'react'
import { componentTypography, typography } from '@/lib/typography'
import { cn } from '@/lib/utils'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeStyles = {
  sm: {
    container: 'h-6 w-6',
    text: 'text-xs',
    title: typography.navLink
  },
  md: {
    container: 'h-8 w-8',
    text: 'text-sm',
    title: componentTypography.sidebar.header
  },
  lg: {
    container: 'h-10 w-10',
    text: 'text-base',
    title: typography.pageTitle
  }
}

export function Logo({ size = 'md', className }: LogoProps) {
  const styles = sizeStyles[size]
  
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className={cn('bg-primary rounded grid grid-cols-1 justify-items-center items-center', styles.container)}>
        <span className={cn('text-primary-foreground font-bold', styles.text)}>OM</span>
      </div>
      <span className={cn('text-slate-900 dark:text-white', styles.title)}>
        OM Intel Chat
      </span>
    </div>
  )
}