/**
 * Sentry Client Configuration for Next.js 15
 * This file replaces the deprecated sentry.client.config.js
 * https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client
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
  
  // Environment
  environment: process.env.NODE_ENV || 'development',
  
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
      // Routing instrumentation
      routingInstrumentation: Sentry.nextRouterInstrumentation,
    }),
  ],
  
  // Error filtering for client-side
  beforeSend(event) {
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
    
    return event
  },
  })
} else {
  console.log('🟡 Sentry DSN not configured - Sentry monitoring disabled')
}