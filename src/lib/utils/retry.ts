/**
 * Retry Utilities with Exponential Backoff
 * 
 * Production-ready retry logic for OpenAI API requests with:
 * - Exponential backoff with jitter
 * - Configurable retry conditions
 * - Timeout handling
 * - Detailed error reporting
 */

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number; // 0-1, adds randomness to prevent thundering herd
  retryableErrors: string[];
  timeoutMs?: number;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalTimeMs: number;
}

// Default configuration optimized for OpenAI API
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,        // Start with 1 second
  maxDelayMs: 30000,        // Cap at 30 seconds
  backoffMultiplier: 2,     // Double delay each retry
  jitterFactor: 0.25,       // ±25% randomness
  retryableErrors: [
    'ECONNRESET',
    'ENOTFOUND',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'rate_limit_exceeded',
    'model_overloaded',
    'server_error',
    'service_unavailable',
    'timeout'
  ],
  timeoutMs: 120000 // 2 minutes total timeout
};

export class RetryableError extends Error {
  constructor(
    message: string,
    public originalError: Error,
    public retryable: boolean = true,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'RetryableError';
  }
}

/**
 * Execute a function with retry logic and exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  operationName: string = 'operation'
): Promise<RetryResult<T>> {
  const finalConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const startTime = Date.now();
  
  let lastError: Error;
  let attempts = 0;

  // Overall timeout
  const timeoutPromise = finalConfig.timeoutMs 
    ? new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Operation timeout after ${finalConfig.timeoutMs}ms`)), finalConfig.timeoutMs);
      })
    : null;

  try {
    while (attempts < finalConfig.maxAttempts) {
      attempts++;
      
      try {
        console.debug(`Attempting ${operationName} (attempt ${attempts}/${finalConfig.maxAttempts})`);
        
        // Execute with timeout if specified
        const operationPromise = operation();
        const result = timeoutPromise 
          ? await Promise.race([operationPromise, timeoutPromise])
          : await operationPromise;
        
        const totalTime = Date.now() - startTime;
        console.info(`${operationName} succeeded after ${attempts} attempt(s) in ${totalTime}ms`);
        
        return {
          success: true,
          result,
          attempts,
          totalTimeMs: totalTime
        };
        
      } catch (error) {
        lastError = error as Error;
        
        console.warn(`${operationName} failed on attempt ${attempts}:`, {
          error: lastError.message,
          type: lastError.constructor.name,
          retryable: isRetryableError(lastError, finalConfig)
        });
        
        // Check if error is retryable
        if (!isRetryableError(lastError, finalConfig)) {
          console.error(`${operationName} failed with non-retryable error:`, lastError.message);
          break;
        }
        
        // Don't delay after the last attempt
        if (attempts < finalConfig.maxAttempts) {
          const delay = calculateDelay(attempts, finalConfig);
          console.debug(`Waiting ${delay}ms before retry ${attempts + 1}`);
          await sleep(delay);
        }
      }
    }
    
    // All retries exhausted
    const totalTime = Date.now() - startTime;
    console.error(`${operationName} failed after ${attempts} attempt(s) in ${totalTime}ms`);
    
    return {
      success: false,
      error: lastError,
      attempts,
      totalTimeMs: totalTime
    };
    
  } catch (error) {
    // Catch timeout or other unexpected errors
    return {
      success: false,
      error: error as Error,
      attempts,
      totalTimeMs: Date.now() - startTime
    };
  }
}

/**
 * Determine if an error should trigger a retry
 */
export function isRetryableError(error: Error, config: RetryConfig): boolean {
  // Check for RetryableError class
  if (error instanceof RetryableError) {
    return error.retryable;
  }
  
  // Check error message against retryable patterns
  const errorMessage = error.message.toLowerCase();
  const errorName = error.name.toLowerCase();
  
  return config.retryableErrors.some(pattern => 
    errorMessage.includes(pattern.toLowerCase()) || 
    errorName.includes(pattern.toLowerCase())
  );
}

/**
 * Calculate delay for exponential backoff with jitter
 */
export function calculateDelay(attempt: number, config: RetryConfig): number {
  // Exponential backoff: baseDelay * (multiplier ^ (attempt - 1))
  const exponentialDelay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
  
  // Add jitter to prevent thundering herd
  const jitterRange = exponentialDelay * config.jitterFactor;
  const jitter = (Math.random() - 0.5) * 2 * jitterRange; // ±jitterRange
  
  const finalDelay = exponentialDelay + jitter;
  
  // Ensure delay is within bounds
  return Math.max(0, Math.min(finalDelay, config.maxDelayMs));
}

/**
 * Sleep utility for delays
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry decorator for class methods
 */
export function retryable(config: Partial<RetryConfig> = {}) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const result = await withRetry(
        () => originalMethod.apply(this, args),
        config,
        `${target.constructor.name}.${propertyKey}`
      );
      
      if (result.success) {
        return result.result;
      } else {
        throw result.error;
      }
    };
    
    return descriptor;
  };
}

/**
 * Batch retry operations with concurrency control
 */
export async function retryBatch<T>(
  operations: Array<() => Promise<T>>,
  config: Partial<RetryConfig> = {},
  concurrency: number = 3
): Promise<Array<RetryResult<T>>> {
  const results: Array<RetryResult<T>> = [];
  const executing: Promise<void>[] = [];
  
  for (let i = 0; i < operations.length; i++) {
    const operation = operations[i];
    
    const promise = withRetry(operation, config, `batch-operation-${i}`)
      .then(result => {
        results[i] = result;
      });
    
    executing.push(promise);
    
    // Control concurrency
    if (executing.length >= concurrency) {
      await Promise.race(executing);
      // Remove completed promises
      executing.splice(0, executing.findIndex(p => p === promise) + 1);
    }
  }
  
  // Wait for remaining operations
  await Promise.all(executing);
  
  return results;
}

/**
 * Create a retryable version of any async function
 */
export function makeRetryable<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  config: Partial<RetryConfig> = {}
): T {
  return (async (...args: Parameters<T>) => {
    const result = await withRetry(
      () => fn(...args),
      config,
      fn.name || 'anonymous-function'
    );
    
    if (result.success) {
      return result.result;
    } else {
      throw result.error;
    }
  }) as T;
}

/**
 * Utility to create domain-specific retryable errors
 */
export function createRetryableError(
  message: string,
  originalError: Error,
  statusCode?: number,
  retryable: boolean = true
): RetryableError {
  return new RetryableError(message, originalError, retryable, statusCode);
}

/**
 * Parse OpenAI API errors and determine retry behavior
 */
export function parseOpenAIError(error: any): RetryableError {
  const message = error.message || 'Unknown OpenAI error';
  const statusCode = error.status || error.statusCode;
  
  // Rate limiting - always retryable
  if (statusCode === 429 || message.includes('rate limit')) {
    return createRetryableError('Rate limit exceeded', error, statusCode, true);
  }
  
  // Server errors - retryable
  if (statusCode >= 500 || message.includes('server error') || message.includes('overloaded')) {
    return createRetryableError('Server error', error, statusCode, true);
  }
  
  // Context length - not retryable (need to reduce input)
  if (message.includes('context_length_exceeded') || message.includes('too long')) {
    return createRetryableError('Context length exceeded', error, statusCode, false);
  }
  
  // Authentication errors - not retryable
  if (statusCode === 401 || statusCode === 403 || message.includes('authentication')) {
    return createRetryableError('Authentication error', error, statusCode, false);
  }
  
  // Client errors (4xx) - generally not retryable
  if (statusCode >= 400 && statusCode < 500) {
    return createRetryableError('Client error', error, statusCode, false);
  }
  
  // Network errors - retryable
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
    return createRetryableError('Network error', error, undefined, true);
  }
  
  // Default to non-retryable for unknown errors
  return createRetryableError(message, error, statusCode, false);
}