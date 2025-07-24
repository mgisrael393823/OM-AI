/**
 * Sentry Server Configuration for Next.js 15
 * This file is imported by the instrumentation.ts file
 */

import * as Sentry from '@sentry/nextjs'

// Only initialize Sentry if DSN is provided
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  
  // Performance monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  
  // Debug mode for development
  debug: process.env.NODE_ENV === 'development',
  
  // Server-specific options
  environment: process.env.NODE_ENV || 'development',
  
  // Integrations for server-side
  integrations: [
    // Add server-specific integrations here if needed
  ],
  
  // Error filtering
  beforeSend(event) {
    // Filter out non-critical errors in development
    if (process.env.NODE_ENV === 'development') {
      // Skip certain development-only errors
      if (event.exception?.values?.[0]?.value?.includes('ENOENT')) {
        return null
      }
    }
    return event
  },
  })
} else {
  console.log('🟡 Sentry DSN not configured - Server-side monitoring disabled')
}