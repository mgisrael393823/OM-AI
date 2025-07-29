/**
 * Sentry Client Configuration for Next.js 15
 * This file replaces the deprecated sentry.client.config.js
 * https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client
 */

import * as Sentry from '@sentry/nextjs'

// Export router transition hook for navigation instrumentation
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart

// Get release information (same logic as server)
const getRelease = () => {
  // Try to get release from environment variables (set by CI/CD)
  if (typeof window !== 'undefined' && (window as any).__SENTRY_RELEASE__) {
    return (window as any).__SENTRY_RELEASE__
  }
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
  
    // Performance monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    
    // Debug mode for development
    debug: process.env.NODE_ENV === 'development',
  
  // Session Replay configuration
  replaysOnErrorSampleRate: 1.0, // Capture 100% of sessions with errors
  replaysSessionSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0.5, // Lower in prod
  
  // Client-side integrations
  integrations: [
    Sentry.replayIntegration({
      // Privacy settings
      maskAllText: true,
      blockAllMedia: true,
      
      // Performance settings
      networkDetailAllowUrls: [
        // Allow network details for your API routes
        /^\/api\//,
      ],
    }),
    
    // Browser performance monitoring
    Sentry.browserTracingIntegration({
      // Next.js router integration is handled automatically
    }),
  ],
  
  // Enhanced error filtering for client-side
  beforeSend(event, hint) {
    // Fix object serialization issues that cause "Object.s" errors
    if (event.exception?.values) {
      for (const exception of event.exception.values) {
        // Fix serialization issues
        if (typeof exception.value === 'object' && exception.value !== null) {
          try {
            exception.value = JSON.stringify(exception.value)
          } catch (e) {
            exception.value = '[Object - could not serialize]'
          }
        }
        
        // Handle cases where value is just "s" or similar fragments
        if (exception.value === 's' || exception.value === 'Object.s') {
          // Try to get better error info from the original error
          if (hint?.originalException) {
            if (typeof hint.originalException === 'string') {
              exception.value = hint.originalException
            } else if (hint.originalException instanceof Error) {
              exception.value = hint.originalException.message
            } else {
              exception.value = `Error: ${JSON.stringify(hint.originalException)}`
            }
          } else {
            exception.value = 'Unknown error (serialization issue)'
          }
        }
      }
    }
    
    // Filter out non-critical client errors
    if (process.env.NODE_ENV === 'development') {
      // Skip certain development-only errors
      if (event.exception?.values?.[0]?.value?.includes('ChunkLoadError')) {
        return null
      }
    }
    
    // Filter out network errors that are not actionable
    if (event.exception?.values?.[0]?.value?.includes('NetworkError')) {
      return null
    }
    
    // Skip test environment fallback warnings
    if (event.level === 'warning' && 
        event.message?.includes('Using fallback profile') &&
        (navigator?.userAgent?.includes('HeadlessChrome') || 
         (typeof event.contexts?.browser?.name === 'string' && 
          event.contexts.browser.name.includes('HeadlessChrome')))) {
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
    // Filter out navigation breadcrumbs for test environments
    if (breadcrumb.category === 'navigation' && 
        navigator?.userAgent?.includes('HeadlessChrome')) {
      return null
    }
    return breadcrumb
  },
  })
} else {
  console.log('🟡 Sentry DSN not configured - Sentry monitoring disabled')
}