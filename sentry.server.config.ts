/**
 * Sentry Server Configuration for Next.js 15
 * This file is imported by the instrumentation.ts file
 */

import * as Sentry from '@sentry/nextjs'

// Get release information from environment or git
const getRelease = () => {
  // Try to get release from environment variables (set by CI/CD)
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.substring(0, 7)
  }
  if (process.env.SENTRY_RELEASE) {
    return process.env.SENTRY_RELEASE
  }
  // Fallback to package version
  try {
    const path = require('path')
    const pkg = require(path.join(process.cwd(), 'package.json'))
    return pkg.version
  } catch {
    return 'unknown'
  }
}

// Only initialize Sentry if DSN is provided
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    
    // Release tracking
    release: getRelease(),
    environment: process.env.NODE_ENV || 'development',
  
    // Performance monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    
    // Debug mode for development
    debug: process.env.NODE_ENV === 'development',
    
    // Server-specific integrations
    integrations: [
      // Add server-specific integrations here if needed
    ],
    
    // Enhanced error filtering and processing
    beforeSend(event, hint) {
      // Add more context to errors
      if (event.exception?.values) {
        for (const exception of event.exception.values) {
          // Fix serialization issues
          if (typeof exception.value === 'object') {
            exception.value = JSON.stringify(exception.value)
          }
        }
      }
      
      // Filter out non-critical errors in development
      if (process.env.NODE_ENV === 'development') {
        // Skip certain development-only errors
        if (event.exception?.values?.[0]?.value?.includes('ENOENT')) {
          return null
        }
      }
      
      // Skip database fallback warnings in test environments
      if (event.level === 'warning' && 
          event.message?.includes('Using fallback profile') &&
          (typeof event.contexts?.browser?.name === 'string' && 
           event.contexts.browser.name.includes('HeadlessChrome'))) {
        return null
      }
      
      return event
    },
    
    // Add breadcrumb filtering
    beforeBreadcrumb(breadcrumb) {
      // Filter out noisy breadcrumbs
      if (breadcrumb.category === 'console' && breadcrumb.level === 'debug') {
        return null
      }
      return breadcrumb
    },
  })
} else {
  console.log('🟡 Sentry DSN not configured - Server-side monitoring disabled')
}