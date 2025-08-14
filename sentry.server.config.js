/**
 * Enhanced Sentry Server Configuration for OM-AI
 * Provides comprehensive server-side error monitoring with database integration,
 * API error tracking, and performance monitoring for Node.js environments.
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

// Get release information from environment or git
function getRelease() {
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

// Get environment name
function getEnvironment() {
  return process.env.VERCEL_ENV || process.env.NODE_ENV || 'development'
}

// Enhanced server context collection
function getServerContext() {
  try {
    return {
      // Node.js runtime information
      runtime: {
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch,
        uptime: process.uptime(),
        pid: process.pid,
      },
      
      // Memory usage
      memory: process.memoryUsage(),
      
      // CPU usage (if available)
      cpuUsage: typeof process.cpuUsage === 'function' ? process.cpuUsage() : null,
      
      // Environment information
      environment: {
        nodeEnv: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL_ENV,
        vercelRegion: process.env.VERCEL_REGION,
        vercelUrl: process.env.VERCEL_URL,
        isVercel: !!process.env.VERCEL,
      },
      
      // Resource limits (if available)
      resourceUsage: typeof process.resourceUsage === 'function' ? process.resourceUsage() : null,
      
      // Timing information
      timing: {
        startTime: Date.now(),
        hrtime: process.hrtime(),
      },
    }
  } catch (error) {
    console.warn('[Sentry] Failed to collect server context:', error)
    return {}
  }
}

// Database error context extraction
function extractDatabaseError(error) {
  if (!error) return null
  
  const dbContext = {
    isDatabaseError: false,
    query: null,
    table: null,
    code: null,
    detail: null,
    hint: null,
  }
  
  // PostgreSQL/Supabase error patterns
  if (error.code) {
    dbContext.isDatabaseError = true
    dbContext.code = error.code
  }
  
  if (error.detail) {
    dbContext.detail = error.detail
  }
  
  if (error.hint) {
    dbContext.hint = error.hint
  }
  
  // Extract table name from error message
  const tableMatch = error.message?.match(/table "([^"]+)"/i)
  if (tableMatch) {
    dbContext.table = tableMatch[1]
  }
  
  // Extract query information (sanitized)
  if (error.query) {
    // Sanitize query to remove sensitive data
    dbContext.query = error.query.replace(/('[^']*'|"[^"]*")/g, '[SANITIZED]')
  }
  
  return dbContext.isDatabaseError ? dbContext : null
}

// API error context extraction
function extractAPIError(error, req) {
  if (!req) return null
  
  return {
    isAPIError: true,
    method: req.method,
    url: req.url,
    headers: {
      'content-type': req.headers?.['content-type'],
      'user-agent': req.headers?.['user-agent'],
      'origin': req.headers?.['origin'],
      'referer': req.headers?.['referer'],
    },
    query: req.query,
    // Don't log body in production for security
    body: getEnvironment() === 'development' ? req.body : '[HIDDEN]',
  }
}

// Intelligent server error filtering
function shouldCaptureServerError(event) {
  const error = event.exception?.values?.[0]
  if (!error) return true
  
  const errorMessage = error.value || ''
  const errorType = error.type || ''
  
  // Filter out non-critical server errors
  const nonCriticalPatterns = [
    /ENOENT/,
    /ECONNRESET/,
    /EPIPE/,
    /Client disconnected/i,
    /Request timeout/i,
    /Connection timeout/i,
    /Rate limit exceeded/i,
  ]
  
  // Only filter in production to avoid missing issues in development
  if (getEnvironment() === 'production') {
    for (const pattern of nonCriticalPatterns) {
      if (pattern.test(errorMessage) || pattern.test(errorType)) {
        return false
      }
    }
  }
  
  // Filter out database connection timeouts (common in serverless)
  const dbTimeoutPatterns = [
    /connection timeout/i,
    /connection pool/i,
    /too many connections/i,
  ]
  
  for (const pattern of dbTimeoutPatterns) {
    if (pattern.test(errorMessage)) {
      // Still capture but with lower frequency
      return Math.random() < 0.1 // Only capture 10% of these errors
    }
  }
  
  // Filter out test environment errors
  if (process.env.NODE_ENV === 'test') {
    return false
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
    
    // Performance monitoring with conservative sampling for server
    tracesSampleRate: getEnvironment() === 'production' ? 0.05 : 0.5,
    
    // Debug mode for non-production environments
    debug: getEnvironment() !== 'production',
    
    // Server-specific integrations
    integrations: [
      // HTTP integration for request/response tracking
      Sentry.httpIntegration({
        breadcrumbs: true,
        tracing: true,
      }),
      
      // Node.js integration
      Sentry.nodeContextIntegration(),
      
      // Local variables integration (careful in production)
      Sentry.localVariablesIntegration({
        captureAllExceptions: getEnvironment() !== 'production',
        maxExceptionsPerSecond: 5,
      }),
      
      // Console integration for breadcrumbs
      Sentry.consoleIntegration({
        levels: ['error', 'warn'], // Only capture errors and warnings
      }),
      
      // Modules integration
      Sentry.modulesIntegration(),
      
      // Context integration
      Sentry.contextIntegration(),
    ],
    
    // Enhanced error processing
    beforeSend(event, hint) {
      // Apply intelligent error filtering
      if (!shouldCaptureServerError(event)) {
        return null
      }
      
      // Add server context
      const serverContext = getServerContext()
      if (Object.keys(serverContext).length > 0) {
        event.contexts = {
          ...event.contexts,
          server: serverContext,
        }
      }
      
      // Extract database error context
      if (hint?.originalException) {
        const dbContext = extractDatabaseError(hint.originalException)
        if (dbContext) {
          event.contexts = {
            ...event.contexts,
            database: dbContext,
          }
        }
        
        // Extract API error context if request is available
        if (hint.request) {
          const apiContext = extractAPIError(hint.originalException, hint.request)
          if (apiContext) {
            event.contexts = {
              ...event.contexts,
              api: apiContext,
            }
          }
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
                  exception.value = 'Unknown server error (serialization failed)'
                }
              }
            } else {
              exception.value = 'Unknown server error (no context available)'
            }
          }
        }
      }
      
      // Add server-specific tags
      event.tags = {
        ...event.tags,
        component: 'server',
        runtime: 'nodejs',
        serverless: !!process.env.VERCEL,
      }
      
      // Sanitize sensitive data
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
        
        // Remove sensitive query parameters
        const sensitiveQueryParams = ['token', 'key', 'password', 'secret']
        if (event.request.query_string) {
          sensitiveQueryParams.forEach(param => {
            if (event.request.query_string.includes(param)) {
              event.request.query_string = '[SANITIZED]'
            }
          })
        }
      }
      
      return event
    },
    
    // Enhanced breadcrumb processing
    beforeBreadcrumb(breadcrumb, hint) {
      // Filter out noisy breadcrumbs
      if (breadcrumb.category === 'console' && 
          (breadcrumb.level === 'debug' || breadcrumb.level === 'info')) {
        return null
      }
      
      // Filter out database connection breadcrumbs (too noisy)
      if (breadcrumb.category === 'query' && breadcrumb.message?.includes('connect')) {
        return null
      }
      
      // Enhance HTTP breadcrumbs with timing
      if (breadcrumb.category === 'http') {
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
        component: 'server',
        project: 'om-ai',
        runtime: 'nodejs',
      },
    },
    
    // Transport options for better reliability
    transport: Sentry.makeNodeTransport,
    
    // Maximum breadcrumbs to keep
    maxBreadcrumbs: 50,
    
    // Attach stack trace to all events
    attachStacktrace: true,
    
    // Send default PII (be careful in production)
    sendDefaultPii: getEnvironment() !== 'production',
  })
  
  console.log(`🟢 Sentry server monitoring enabled for ${getEnvironment()}`)
} else {
  console.log('🟡 Sentry server monitoring disabled (no DSN configured)')
}

// Enhanced error capture functions for server use
function captureServerError(error, context = {}) {
  if (dsn) {
    Sentry.withScope((scope) => {
      // Add server context
      const serverContext = getServerContext()
      scope.setContext('server', serverContext)
      
      // Add custom context
      Object.keys(context).forEach((key) => {
        scope.setContext(key, context[key])
      })
      
      Sentry.captureException(error)
    })
  }
}

function captureAPIError(error, req, res, context = {}) {
  if (dsn) {
    Sentry.withScope((scope) => {
      // Add API context
      const apiContext = extractAPIError(error, req)
      if (apiContext) {
        scope.setContext('api', apiContext)
      }
      
      // Add response context
      if (res) {
        scope.setContext('response', {
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
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

function captureDatabaseError(error, query, context = {}) {
  if (dsn) {
    Sentry.withScope((scope) => {
      // Add database context
      const dbContext = extractDatabaseError(error)
      if (dbContext) {
        scope.setContext('database', dbContext)
      }
      
      // Add query context (sanitized)
      if (query) {
        scope.setContext('query', {
          sanitizedQuery: typeof query === 'string' ? 
            query.replace(/('[^']*'|"[^"]*")/g, '[SANITIZED]') : '[COMPLEX_QUERY]',
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
  captureServerError,
  captureAPIError,
  captureDatabaseError
}