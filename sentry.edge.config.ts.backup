/**
 * Sentry Edge Runtime Configuration for Next.js 15
 * This file handles Sentry initialization for Edge runtime (middleware, etc.)
 */

import * as Sentry from '@sentry/nextjs'

// Get release information
const getRelease = () => {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.substring(0, 7)
  }
  if (process.env.SENTRY_RELEASE) {
    return process.env.SENTRY_RELEASE
  }
  return 'unknown'
}

// Only initialize Sentry if DSN is provided
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    
    // Release tracking
    release: getRelease(),
    environment: process.env.NODE_ENV || 'development',
  
    // Performance monitoring (lower sample rate for edge)
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0,
    
    // Debug mode for development
    debug: process.env.NODE_ENV === 'development',
    
    // Error filtering for edge runtime
    beforeSend(event, hint) {
      // Fix serialization issues
      if (event.exception?.values) {
        for (const exception of event.exception.values) {
          if (typeof exception.value === 'object' && exception.value !== null) {
            try {
              exception.value = JSON.stringify(exception.value)
            } catch (e) {
              exception.value = '[Object - could not serialize]'
            }
          }
        }
      }
      return event
    },
  })
} else {
  console.log('🟡 Sentry DSN not configured - Edge runtime monitoring disabled')
}