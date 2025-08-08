/**
 * Error recovery utilities for improved UX
 */

export interface RetryOptions {
  maxAttempts?: number
  delay?: number
  exponentialBackoff?: boolean
  onRetry?: (attempt: number, error: Error) => void
}

/**
 * Retry a function with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delay = 1000,
    exponentialBackoff = true,
    onRetry
  } = options

  let lastError: Error

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      
      if (attempt === maxAttempts) {
        throw lastError
      }

      if (onRetry) {
        onRetry(attempt, lastError)
      }

      // Calculate delay with optional exponential backoff
      const waitTime = exponentialBackoff 
        ? delay * Math.pow(2, attempt - 1)
        : delay

      await new Promise(resolve => setTimeout(resolve, waitTime))
    }
  }

  throw lastError!
}

/**
 * Enhanced fetch with automatic retries for network errors
 */
export async function fetchWithRetry(
  url: string, 
  options: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<Response> {
  return withRetry(async () => {
    const response = await fetch(url, options)
    
    // Don't retry client errors (4xx), only server errors and network issues
    if (response.status >= 400 && response.status < 500) {
      throw new Error(`Client error: ${response.status} ${response.statusText}`)
    }
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status} ${response.statusText}`)
    }
    
    return response
  }, {
    maxAttempts: 3,
    delay: 1000,
    exponentialBackoff: true,
    ...retryOptions
  })
}

/**
 * Safe async operation with error boundaries
 */
export async function safeAsync<T>(
  operation: () => Promise<T>,
  fallback?: T,
  onError?: (error: Error) => void
): Promise<T | undefined> {
  try {
    return await operation()
  } catch (error) {
    console.error('Safe async operation failed:', error)
    
    if (onError) {
      onError(error as Error)
    }
    
    return fallback
  }
}

/**
 * Create user-friendly error messages from technical errors
 */
export function getUserFriendlyErrorMessage(error: Error | string): string {
  const message = typeof error === 'string' ? error : error.message

  // Network errors
  if (message.includes('fetch') || message.includes('Network') || message.includes('Failed to fetch')) {
    return 'Network connection failed. Please check your internet connection and try again.'
  }

  // Authentication errors
  if (message.includes('401') || message.includes('Unauthorized') || message.includes('jwt')) {
    return 'Your session has expired. Please sign in again.'
  }

  // Rate limiting
  if (message.includes('429') || message.includes('rate limit') || message.includes('Too Many Requests')) {
    return 'Too many requests. Please wait a moment and try again.'
  }

  // Server errors
  if (message.includes('500') || message.includes('Internal Server Error')) {
    return 'Server error occurred. Our team has been notified. Please try again later.'
  }

  // File upload errors
  if (message.includes('File too large') || message.includes('413')) {
    return 'File is too large. Please use a smaller file (max 16MB).'
  }

  // PDF processing errors
  if (message.includes('PDF') && message.includes('parsing')) {
    return 'Unable to process this PDF. Please ensure it\'s not corrupted or encrypted.'
  }

  // Fallback to original message if it's already user-friendly
  if (message.length < 100 && !message.includes('Error:') && !message.includes('Exception')) {
    return message
  }

  // Generic fallback
  return 'An unexpected error occurred. Please try again or contact support if the problem persists.'
}

/**
 * Recovery strategies for common error scenarios
 */
export class ErrorRecovery {
  static async handleApiError(error: Error, context: string): Promise<string> {
    const userMessage = getUserFriendlyErrorMessage(error)
    
    // Log technical details for debugging
    console.error(`API Error in ${context}:`, {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      context
    })

    // Could send to error reporting service here
    // await reportError(error, context)

    return userMessage
  }

  static async recoverFromFailedUpload(
    uploadFn: () => Promise<any>,
    onProgress?: (message: string) => void
  ): Promise<any> {
    const strategies = [
      {
        name: 'Direct retry',
        attempt: () => uploadFn()
      },
      {
        name: 'Retry with delay',
        attempt: async () => {
          if (onProgress) onProgress('Retrying upload...')
          await new Promise(resolve => setTimeout(resolve, 2000))
          return uploadFn()
        }
      },
      {
        name: 'Clear cache and retry',
        attempt: async () => {
          if (onProgress) onProgress('Clearing cache and retrying...')
          // Clear any cached auth tokens or state
          localStorage.removeItem('supabase.auth.token')
          await new Promise(resolve => setTimeout(resolve, 1000))
          return uploadFn()
        }
      }
    ]

    for (const strategy of strategies) {
      try {
        if (onProgress) onProgress(`Attempting ${strategy.name}...`)
        return await strategy.attempt()
      } catch (error) {
        console.warn(`Recovery strategy "${strategy.name}" failed:`, error)
      }
    }

    throw new Error('All recovery strategies failed')
  }
}