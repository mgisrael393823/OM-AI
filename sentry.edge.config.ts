/**
 * Sentry Edge Runtime Configuration for Next.js 15
 * This file handles Sentry initialization for Edge runtime (middleware, etc.)
 */

import * as Sentry from '@sentry/nextjs'

// Only initialize Sentry if DSN is provided
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  
  // Performance monitoring (lower sample rate for edge)
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0,
  
  // Debug mode for development
  debug: process.env.NODE_ENV === 'development',
  
  // Environment
  environment: process.env.NODE_ENV || 'development',
  })
} else {
  console.log('🟡 Sentry DSN not configured - Edge runtime monitoring disabled')
}