/**
 * Enhanced Sentry Edge Runtime Configuration for OM-AI
 * Provides lightweight error monitoring for Edge Runtime environments
 * (Vercel Edge Functions, Middleware, etc.)
 */

const Sentry = require('@sentry/nextjs')

// Environment-specific DSN selection
function getDSN() {
  // Production DSN (your provided DSN)
  const productionDSN = 'https://47996feeefcc46d6d6bb4ad64cd12443@o4509724018409472.ingest.us.sentry.io/4509724031516672'
  
  // Environment detection
  const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || 'development'
  
  switch (environment) {
    case 'production':
      return productionDSN
    case 'preview':
      return productionDSN // Use same DSN for preview environments
    case 'development':
      return null // Disable Sentry in development
    default:
      return productionDSN
  }
}

// Get release information
function getRelease() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.substring(0, 7)
  }
  if (process.env.SENTRY_RELEASE) {
    return process.env.SENTRY_RELEASE
  }
  return 'unknown'
}

// Get environment name
function getEnvironment() {
  return process.env.VERCEL_ENV || process.env.NODE_ENV || 'development'
}

// Enhanced edge context collection
function getEdgeContext() {
  try {
    return {
      // Runtime information
      runtime: {
        isEdge: true,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        platform: typeof navigator !== 'undefined' ? navigator.platform : null,
        language: typeof navigator !== 'undefined' ? navigator.language : null,
      },
      
      // Environment information
      environment: {
        nodeEnv: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL_ENV,
        vercelRegion: process.env.VERCEL_REGION,
        isVercelEdge: process.env.NEXT_RUNTIME === 'edge',
      },
      
      // Timing information
      timing: {
        startTime: Date.now(),
      },
    }
  } catch (error) {
    console.warn('[Sentry Edge] Failed to collect context:', error)
    return {}
  }
}

// Edge-specific error filtering
function shouldCaptureEdgeError(event) {
  const error = event.exception?.values?.[0]
  if (!error) return true
  
  const errorMessage = error.value || ''
  
  // Filter out common edge runtime non-critical errors
  const nonCriticalPatterns = [
    /Request timeout/i,
    /Connection timeout/i,
    /AbortError/i,
    /The operation was aborted/i,
    /Network request failed/i,
  ]
  
  for (const pattern of nonCriticalPatterns) {
    if (pattern.test(errorMessage)) {
      return false
    }
  }
  
  return true
}

// Initialize Sentry if DSN is available
const dsn = getDSN()
if (dsn) {
  Sentry.init({
    dsn,
    
    // Release and environment tracking
    release: getRelease(),
    environment: getEnvironment(),
    
    // Conservative performance monitoring for edge runtime
    tracesSampleRate: getEnvironment() === 'production' ? 0.02 : 0.2,
    
    // Debug mode for non-production environments
    debug: getEnvironment() !== 'production',
    
    // Lightweight integrations for edge runtime
    integrations: [
      // Basic HTTP integration
      Sentry.httpIntegration({
        breadcrumbs: true,
        tracing: false, // Disabled for performance in edge
      }),
      
      // Console integration with minimal levels
      Sentry.consoleIntegration({
        levels: ['error'], // Only capture errors
      }),
    ],
    
    // Enhanced error processing for edge
    beforeSend(event, hint) {
      // Apply edge-specific error filtering
      if (!shouldCaptureEdgeError(event)) {
        return null
      }
      
      // Add edge context
      const edgeContext = getEdgeContext()
      if (Object.keys(edgeContext).length > 0) {
        event.contexts = {
          ...event.contexts,
          edge: edgeContext,
        }
      }
      
      // Fix serialization issues
      if (event.exception?.values) {
        for (const exception of event.exception.values) {
          if (typeof exception.value === 'object' && exception.value !== null) {
            try {
              exception.value = JSON.stringify(exception.value)
            } catch (e) {
              exception.value = '[Object - serialization failed]'
            }
          }
          
          // Handle empty or malformed error messages
          if (!exception.value || exception.value === 's' || exception.value === 'Object.s') {
            if (hint?.originalException) {
              if (typeof hint.originalException === 'string') {
                exception.value = hint.originalException
              } else if (hint.originalException instanceof Error) {
                exception.value = hint.originalException.message || hint.originalException.toString()
              } else {
                try {
                  exception.value = JSON.stringify(hint.originalException)
                } catch (e) {
                  exception.value = 'Unknown edge error (serialization failed)'
                }
              }
            } else {
              exception.value = 'Unknown edge error (no context available)'
            }
          }
        }
      }
      
      // Add edge-specific tags
      event.tags = {
        ...event.tags,
        component: 'edge',
        runtime: 'edge',
        serverless: true,
      }
      
      // Sanitize sensitive data from edge requests
      if (event.request) {
        // Remove sensitive headers
        const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token']
        if (event.request.headers) {
          sensitiveHeaders.forEach(header => {
            if (event.request.headers[header]) {
              event.request.headers[header] = '[SANITIZED]'
            }
          })
        }
        
        // Sanitize URL parameters
        if (event.request.url) {
          const url = new URL(event.request.url)
          const sensitiveParams = ['token', 'key', 'password', 'secret']
          sensitiveParams.forEach(param => {
            if (url.searchParams.has(param)) {
              url.searchParams.set(param, '[SANITIZED]')
            }
          })
          event.request.url = url.toString()
        }
      }
      
      return event
    },
    
    // Minimal breadcrumb processing for edge
    beforeBreadcrumb(breadcrumb, hint) {
      // Only keep error-level breadcrumbs in edge for performance
      if (breadcrumb.level !== 'error' && breadcrumb.level !== 'warning') {
        return null
      }
      
      // Enhance HTTP breadcrumbs with basic timing
      if (breadcrumb.category === 'http' || breadcrumb.category === 'fetch') {
        breadcrumb.data = {
          ...breadcrumb.data,
          timestamp: Date.now(),
        }
        
        // Sanitize sensitive URLs
        if (breadcrumb.data?.url) {
          const sensitivePatterns = [/password/i, /token/i, /key/i, /secret/i]
          for (const pattern of sensitivePatterns) {
            if (pattern.test(breadcrumb.data.url)) {
              breadcrumb.data.url = '[SANITIZED]'
              break
            }
          }
        }
      }
      
      return breadcrumb
    },
    
    // Initial scope configuration
    initialScope: {
      tags: {
        component: 'edge',
        project: 'om-ai',
        runtime: 'edge',
      },
    },
    
    // Performance optimizations for edge
    maxBreadcrumbs: 10, // Reduced for edge performance
    attachStacktrace: true,
    sendDefaultPii: false, // Always false in edge for security
    
    // Shorter timeout for edge environments
    shutdownTimeout: 1000, // 1 second
  })
  
  console.log(`🟢 Sentry edge monitoring enabled for ${getEnvironment()}`)
} else {
  console.log('🟡 Sentry edge monitoring disabled (no DSN configured)')
}

// Enhanced error capture functions for edge runtime
function captureEdgeError(error, context = {}) {
  if (dsn) {
    Sentry.withScope((scope) => {
      // Add edge context
      const edgeContext = getEdgeContext()
      scope.setContext('edge', edgeContext)
      
      // Add custom context
      Object.keys(context).forEach((key) => {
        scope.setContext(key, context[key])
      })
      
      Sentry.captureException(error)
    })
  }
}

function captureMiddlewareError(error, req, context = {}) {
  if (dsn) {
    Sentry.withScope((scope) => {
      // Add request context
      if (req) {
        scope.setContext('middleware', {
          url: req.url,
          method: req.method,
          userAgent: req.headers?.get?.('user-agent') || 'unknown',
          origin: req.headers?.get?.('origin') || null,
          referer: req.headers?.get?.('referer') || null,
          ip: req.headers?.get?.('x-forwarded-for') || 
               req.headers?.get?.('x-real-ip') || 'unknown',
        })
      }
      
      // Add custom context
      Object.keys(context).forEach((key) => {
        scope.setContext(key, context[key])
      })
      
      Sentry.captureException(error)
    })
  }
}

module.exports = {
  captureEdgeError,
  captureMiddlewareError
}