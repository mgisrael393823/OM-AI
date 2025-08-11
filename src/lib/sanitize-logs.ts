/**
 * Log sanitization utilities to prevent exposure of sensitive information
 * 
 * Sanitizes API keys, tokens, and other sensitive data from log output
 */

/**
 * Sensitive patterns to redact from logs
 */
const SENSITIVE_PATTERNS = [
  // OpenAI API keys
  /sk-[a-zA-Z0-9]{20,}/g,
  /sk-proj-[a-zA-Z0-9]{20,}/g,
  /sk-svcacct-[a-zA-Z0-9_-]{20,}/g,
  
  // JWT tokens (rough pattern)
  /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g,
  
  // Supabase service role keys
  /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
  
  // Generic API keys and tokens
  /['"](API_KEY|TOKEN|SECRET|KEY)['"]\s*:\s*['"][a-zA-Z0-9_-]{20,}['"]/gi,
  
  // Authorization headers
  /Authorization\s*:\s*Bearer\s+[a-zA-Z0-9_-]+/gi,
  
  // Common secret patterns
  /[a-zA-Z0-9]{32,}/g, // Very long alphanumeric strings (likely keys)
]

/**
 * Redact sensitive information from a string
 */
export function sanitizeString(input: string): string {
  let sanitized = input
  
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match) => {
      // Keep first 6 chars and last 4 chars, redact middle
      if (match.length > 10) {
        const start = match.substring(0, 6)
        const end = match.substring(match.length - 4)
        const stars = '*'.repeat(Math.max(4, match.length - 10))
        return `${start}${stars}${end}`
      } else {
        return '*'.repeat(match.length)
      }
    })
  }
  
  return sanitized
}

/**
 * Sanitize an object by recursively cleaning all string values
 */
export function sanitizeObject(obj: any): any {
  if (typeof obj === 'string') {
    return sanitizeString(obj)
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item))
  }
  
  if (obj !== null && typeof obj === 'object') {
    const sanitized: any = {}
    for (const [key, value] of Object.entries(obj)) {
      // Extra caution for keys that commonly contain sensitive data
      if (/password|secret|key|token|auth/i.test(key) && typeof value === 'string') {
        sanitized[key] = '[REDACTED]'
      } else {
        sanitized[key] = sanitizeObject(value)
      }
    }
    return sanitized
  }
  
  return obj
}

/**
 * Safe console.log that sanitizes sensitive data
 */
export function safeLog(message: string, ...args: any[]): void {
  const sanitizedMessage = sanitizeString(message)
  const sanitizedArgs = args.map(arg => sanitizeObject(arg))
  console.log(sanitizedMessage, ...sanitizedArgs)
}

/**
 * Safe console.error that sanitizes sensitive data
 */
export function safeError(message: string, ...args: any[]): void {
  const sanitizedMessage = sanitizeString(message)
  const sanitizedArgs = args.map(arg => sanitizeObject(arg))
  console.error(sanitizedMessage, ...sanitizedArgs)
}

/**
 * Safe console.warn that sanitizes sensitive data
 */
export function safeWarn(message: string, ...args: any[]): void {
  const sanitizedMessage = sanitizeString(message)
  const sanitizedArgs = args.map(arg => sanitizeObject(arg))
  console.warn(sanitizedMessage, ...sanitizedArgs)
}

/**
 * Sanitize environment variables for safe logging
 */
export function sanitizeEnv(env: Record<string, string | undefined>): Record<string, string> {
  const sanitized: Record<string, string> = {}
  
  for (const [key, value] of Object.entries(env)) {
    if (!value) {
      sanitized[key] = '[UNDEFINED]'
    } else if (/password|secret|key|token|auth/i.test(key)) {
      sanitized[key] = '[REDACTED]'
    } else if (value.length > 50 && /^[a-zA-Z0-9_-]+$/.test(value)) {
      // Likely a long token/key even if not in the key name
      sanitized[key] = `[REDACTED_LONG_VALUE_${value.length}_CHARS]`
    } else {
      sanitized[key] = sanitizeString(value)
    }
  }
  
  return sanitized
}