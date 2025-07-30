import { fontClasses } from './fonts'
import { cn } from '@/lib/utils'

/**
 * Typography utility functions for consistent font usage across the application
 * Following ChatGPT-inspired design patterns
 */

// Semantic typography combinations
export const typography = {
  // Page and section headers
  pageTitle: cn(fontClasses.heading, 'text-4xl sm:text-5xl font-semibold'), // 36-48px
  sectionHeader: cn(fontClasses.heading, 'text-2xl sm:text-3xl font-semibold'), // 24-28px
  subsectionHeader: cn(fontClasses.heading, 'text-lg font-semibold'), // 18px
  
  // Navigation and UI elements
  navLink: cn(fontClasses.nav, 'text-sm'),
  tabHeader: cn(fontClasses.nav, 'text-sm'),
  buttonText: cn(fontClasses.nav, 'text-sm'),
  
  // Labels and descriptions
  label: cn(fontClasses.label, 'text-sm'),
  caption: cn(fontClasses.label, 'text-xs font-bold uppercase'), // 12px for badges
  helper: cn(fontClasses.label, 'text-xs text-muted-foreground'),
  
  // Body content
  body: cn(fontClasses.body, 'text-base leading-relaxed'), // 16-18px
  bodyLarge: cn(fontClasses.body, 'text-lg sm:text-xl leading-relaxed'), // 18-20px
  bodySmall: cn(fontClasses.body, 'text-sm leading-normal'), // 12-14px
  
  // Chat-specific typography
  chatMessage: cn(fontClasses.body, 'text-sm leading-relaxed'),
  chatTitle: cn(fontClasses.body, 'text-sm font-medium'),
  chatPreview: cn(fontClasses.body, 'text-xs text-muted-foreground'),
  chatTimestamp: cn(fontClasses.label, 'text-xs text-muted-foreground'),
  
  // Input and monospace content
  input: cn(fontClasses.input, 'text-sm'),
  code: cn(fontClasses.mono, 'text-sm'),
  codeBlock: cn(fontClasses.mono, 'text-sm leading-relaxed'),
  
  // Emphasis states
  emphasis: cn(fontClasses.bodyEmphasis, 'text-lg font-bold'), // 18px for stat numbers
  strong: cn(fontClasses.bodyEmphasis, 'text-base font-medium'),
  
  // Status and feedback
  success: cn(fontClasses.label, 'text-sm text-status-success'),
  warning: cn(fontClasses.label, 'text-sm text-status-warning'),
  error: cn(fontClasses.label, 'text-sm text-status-error'),
  info: cn(fontClasses.label, 'text-sm text-status-info'),
} as const

/**
 * Component-specific typography presets
 */
export const componentTypography = {
  // Sidebar components
  sidebar: {
    header: cn(fontClasses.heading, 'text-base font-semibold'),
    sectionLabel: cn(fontClasses.heading, 'text-sm font-medium text-muted-foreground'),
    navItem: cn(fontClasses.nav, 'text-sm'),
    userName: cn(fontClasses.nav, 'text-sm font-medium'),
    userPlan: cn(fontClasses.label, 'text-xs text-muted-foreground'),
  },
  
  // Chat components
  chat: {
    title: cn(fontClasses.body, 'text-sm font-medium'),
    message: cn(fontClasses.body, 'text-sm leading-relaxed'),
    timestamp: cn(fontClasses.label, 'text-xs text-muted-foreground'),
    systemMessage: cn(fontClasses.label, 'text-xs text-muted-foreground italic'),
    input: cn(fontClasses.input, 'text-base'), // Larger for better mobile experience
  },
  
  // Form components
  form: {
    label: cn(fontClasses.label, 'text-sm font-medium'),
    input: cn(fontClasses.body, 'text-sm'),
    placeholder: cn(fontClasses.body, 'text-sm text-muted-foreground'),
    error: cn(fontClasses.label, 'text-xs text-destructive'),
    helper: cn(fontClasses.label, 'text-xs text-muted-foreground'),
  },
  
  // Card and content components
  card: {
    title: cn(fontClasses.heading, 'text-lg font-semibold'), // 18px for card titles
    subtitle: cn(fontClasses.nav, 'text-sm text-muted-foreground'),
    content: cn(fontClasses.body, 'text-base'), // 14-16px for card descriptions
    footer: cn(fontClasses.label, 'text-xs text-muted-foreground'),
  },
  
  // Button variants
  button: {
    primary: cn(fontClasses.nav, 'text-base font-medium'), // 14-16px for CTAs
    secondary: cn(fontClasses.nav, 'text-base'),
    ghost: cn(fontClasses.nav, 'text-sm'),
    link: cn(fontClasses.nav, 'text-sm underline-offset-4 hover:underline'),
  },
  
  // Modal and dialog components
  modal: {
    title: cn(fontClasses.heading, 'text-xl font-semibold'),
    subtitle: cn(fontClasses.nav, 'text-sm text-muted-foreground'),
    content: cn(fontClasses.body, 'text-sm'),
  },
} as const

/**
 * Responsive typography helpers
 */
export const responsiveTypography = {
  // Mobile-first approach with larger touch targets
  mobileOptimized: {
    button: cn(fontClasses.nav, 'text-base sm:text-sm font-medium'), // Larger on mobile
    input: cn(fontClasses.input, 'text-base'), // Prevent zoom on iOS
    label: cn(fontClasses.label, 'text-sm'),
  },
  
  // Desktop-optimized variants
  desktopOptimized: {
    compactNav: cn(fontClasses.nav, 'text-xs font-medium'),
    denseContent: cn(fontClasses.body, 'text-xs leading-normal'),
  },
} as const

/**
 * Utility function to apply typography with custom overrides
 */
export function applyTypography(
  preset: keyof typeof typography,
  overrides?: string
): string {
  return cn(typography[preset], overrides)
}

/**
 * Utility function to apply component typography with custom overrides
 */
export function applyComponentTypography(
  component: keyof typeof componentTypography,
  variant: string,
  overrides?: string
): string {
  const componentStyles = componentTypography[component] as Record<string, string>
  return cn(componentStyles[variant], overrides)
}