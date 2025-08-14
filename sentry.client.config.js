/**
 * Enhanced Sentry Client Configuration for OM-AI
 * Provides comprehensive browser-side error monitoring with session replay
 * and intelligent error filtering for production applications.
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
  if (typeof window !== 'undefined' && window.__SENTRY_RELEASE__) {
    return window.__SENTRY_RELEASE__
  }
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

// Enhanced error context collection
function getErrorContext() {
  if (typeof window === 'undefined') return {}
  
  try {
    return {
      // Browser information
      browser: {
        userAgent: navigator.userAgent,
        language: navigator.language,
        cookieEnabled: navigator.cookieEnabled,
        onLine: navigator.onLine,
        platform: navigator.platform,
      },
      
      // Viewport and screen information
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        screenWidth: window.screen?.width,
        screenHeight: window.screen?.height,
        devicePixelRatio: window.devicePixelRatio,
      },
      
      // Performance information
      performance: {
        timeOrigin: performance?.timeOrigin,
        timing: performance?.timing ? {
          navigationStart: performance.timing.navigationStart,
          loadEventEnd: performance.timing.loadEventEnd,
          domContentLoadedEventEnd: performance.timing.domContentLoadedEventEnd,
        } : null,
      },
      
      // Current page context
      page: {
        url: window.location.href,
        pathname: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
        referrer: document.referrer,
        title: document.title,
      },
      
      // Connection information
      connection: navigator.connection ? {
        effectiveType: navigator.connection.effectiveType,
        downlink: navigator.connection.downlink,
        rtt: navigator.connection.rtt,
      } : null,
      
      // Memory information (if available)
      memory: performance?.memory ? {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
      } : null,
    }
  } catch (error) {
    console.warn('[Sentry] Failed to collect error context:', error)
    return {}
  }
}

// Intelligent error filtering
function shouldCaptureError(event) {
  const error = event.exception?.values?.[0]
  if (!error) return true
  
  const errorMessage = error.value || ''
  const errorType = error.type || ''
  
  // Filter out browser extension errors
  const extensionPatterns = [
    /chrome-extension:/,
    /moz-extension:/,
    /safari-extension:/,
    /safari-web-extension:/,
    /extension\//,
    /NonError: Object captured as exception/,
  ]
  
  for (const pattern of extensionPatterns) {
    if (pattern.test(errorMessage) || pattern.test(errorType)) {
      return false
    }
  }
  
  // Filter out ad blocker errors
  const adBlockerPatterns = [
    /blocked by client/i,
    /adblocker/i,
    /adblock/i,
    /ublock/i,
    /ghostery/i,
    /privacy badger/i,
  ]
  
  for (const pattern of adBlockerPatterns) {
    if (pattern.test(errorMessage)) {
      return false
    }
  }
  
  // Filter out common non-actionable errors
  const nonActionablePatterns = [
    /Network request failed/,
    /NetworkError/,
    /Failed to fetch/,
    /Load failed/,
    /Script error/,
    /ResizeObserver loop limit exceeded/,
    /Non-Error promise rejection captured/,
  ]
  
  for (const pattern of nonActionablePatterns) {
    if (pattern.test(errorMessage)) {
      return false
    }
  }
  
  // Filter out development-only errors
  if (getEnvironment() === 'development') {
    const devPatterns = [
      /ChunkLoadError/,
      /Loading chunk \d+ failed/,
      /Loading CSS chunk/,
    ]
    
    for (const pattern of devPatterns) {
      if (pattern.test(errorMessage)) {
        return false
      }
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
    
    // Performance monitoring with environment-aware sampling
    tracesSampleRate: getEnvironment() === 'production' ? 0.1 : 1.0,
    
    // Session replay configuration
    replaysOnErrorSampleRate: 1.0, // Capture 100% of sessions with errors
    replaysSessionSampleRate: getEnvironment() === 'production' ? 0.1 : 0.5,
    
    // Debug mode for non-production environments
    debug: getEnvironment() !== 'production',
    
    // Enhanced integrations
    integrations: [
      // Session replay with privacy settings
      Sentry.replayIntegration({
        // Privacy settings - mask sensitive data
        maskAllText: true,
        blockAllMedia: true,
        maskAllInputs: true,
        
        // Network recording settings
        networkDetailAllowUrls: [
          // Allow network details for your API routes
          /^\/api\//,
          /^https:\/\/.*\.supabase\.co/,
        ],
        
        // Performance settings
        networkCaptureBodies: false,
        networkRequestHeaders: ['content-type', 'accept'],
        networkResponseHeaders: ['content-type'],
        
        // Sampling settings
        sampleRate: 0.1,
        errorSampleRate: 1.0,
      }),
      
      // Browser tracing for performance monitoring
      Sentry.browserTracingIntegration({
        // Automatic instrumentation
        enableLongTask: true,
        enableInp: true,
        enableUserInteractionTracing: true,
        
        // Route change tracking (Next.js handles this automatically)
        // routingInstrumentation is handled by Next.js integration
      }),
      
      // HTTP client integration
      Sentry.httpClientIntegration({
        breadcrumbs: true,
        tracing: true,
      }),
      
      // Console integration for breadcrumbs
      Sentry.breadcrumbsIntegration({
        console: true,
        dom: true,
        fetch: true,
        history: true,
        sentry: false, // Don't log Sentry's own events
        xhr: true,
      }),
    ],
    
    // Enhanced error processing
    beforeSend(event, hint) {
      // Apply intelligent error filtering
      if (!shouldCaptureError(event)) {
        return null
      }
      
      // Add enhanced context
      const context = getErrorContext()
      if (Object.keys(context).length > 0) {
        event.contexts = {
          ...event.contexts,
          ...context,
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
                  exception.value = 'Unknown error (serialization failed)'
                }
              }
            } else {
              exception.value = 'Unknown error (no context available)'
            }
          }
        }
      }
      
      // Add user feedback capability
      event.tags = {
        ...event.tags,
        component: 'client',
        canCollectFeedback: true,
      }
      
      return event
    },
    
    // Enhanced breadcrumb processing
    beforeBreadcrumb(breadcrumb, hint) {
      // Filter out noisy breadcrumbs
      if (breadcrumb.category === 'console' && breadcrumb.level === 'debug') {
        return null
      }
      
      // Filter out test environment breadcrumbs
      if (breadcrumb.category === 'navigation' && 
          navigator?.userAgent?.includes('HeadlessChrome')) {
        return null
      }
      
      // Enhance XHR/fetch breadcrumbs with more context
      if (breadcrumb.category === 'xhr' || breadcrumb.category === 'fetch') {
        if (breadcrumb.data?.url) {
          // Add timing information if available
          breadcrumb.data.timestamp = Date.now()
          
          // Sanitize sensitive URLs
          if (breadcrumb.data.url.includes('password') || 
              breadcrumb.data.url.includes('token') ||
              breadcrumb.data.url.includes('key')) {
            breadcrumb.data.url = '[SANITIZED]'
          }
        }
      }
      
      return breadcrumb
    },
    
    // Initial scope configuration
    initialScope: {
      tags: {
        component: 'client',
        project: 'om-ai',
      },
    },
  })
  
  // Export router transition hook for navigation instrumentation
  module.exports = {
    onRouterTransitionStart: Sentry.captureRouterTransitionStart,
  }
  
  console.log(`🟢 Sentry client monitoring enabled for ${getEnvironment()}`)
} else {
  console.log('🟡 Sentry client monitoring disabled (no DSN configured)')
  
  // Export no-op function when Sentry is disabled
  module.exports = {
    onRouterTransitionStart: () => {},
  }
}

// User feedback integration
function showUserFeedbackDialog(eventId) {
  if (typeof window !== 'undefined' && window.Sentry) {
    const user = Sentry.getCurrentHub().getScope()?.getUser()
    
    Sentry.showReportDialog({
      eventId,
      user: user || {
        email: 'user@example.com',
        name: 'Anonymous User',
      },
    })
  }
}

// Manual error reporting with enhanced context
function captureErrorWithContext(error, context = {}) {
  if (dsn) {
    Sentry.withScope((scope) => {
      // Add custom context
      Object.keys(context).forEach((key) => {
        scope.setContext(key, context[key])
      })
      
      // Add current error context
      const errorContext = getErrorContext()
      scope.setContext('errorContext', errorContext)
      
      Sentry.captureException(error)
    })
  }
}

// Add these functions to the module exports
if (dsn) {
  module.exports.showUserFeedbackDialog = showUserFeedbackDialog
  module.exports.captureErrorWithContext = captureErrorWithContext
} else {
  module.exports.showUserFeedbackDialog = () => {}
  module.exports.captureErrorWithContext = () => {}
}