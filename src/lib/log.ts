/**
 * Structured Logging Helper
 * 
 * Provides consistent logging format across all API endpoints
 * for debugging and monitoring cross-runtime context operations
 */

export interface LogFields {
  documentId: string
  userId: string
  kvWrite?: boolean
  kvRead?: boolean
  parts?: number
  status?: string
  error?: string
  request_id: string
  [key: string]: any // Allow additional fields
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * Emit structured log with consistent format
 */
export function structuredLog(
  level: LogLevel,
  message: string,
  fields: LogFields
): void {
  const timestamp = new Date().toISOString()
  const pid = process.pid
  
  // Build log object
  const logObject = {
    timestamp,
    level,
    message,
    pid,
    ...fields
  }
  
  // Remove undefined values
  Object.keys(logObject).forEach(key => {
    if (logObject[key] === undefined) {
      delete logObject[key]
    }
  })
  
  // Format for console output
  const logString = `[${level.toUpperCase()}] ${message} | ${JSON.stringify({
    documentId: fields.documentId,
    userId: fields.userId,
    kvWrite: fields.kvWrite,
    kvRead: fields.kvRead,
    parts: fields.parts,
    status: fields.status,
    request_id: fields.request_id,
    ...(fields.error && { error: fields.error })
  })}`
  
  // Output based on level
  switch (level) {
    case 'debug':
      if (process.env.NODE_ENV === 'development') {
        console.debug(logString)
      }
      break
    case 'info':
      console.log(logString)
      break
    case 'warn':
      console.warn(logString)
      break
    case 'error':
      console.error(logString)
      break
  }
}

/**
 * Generate request ID
 */
export function generateRequestId(prefix: string = 'req'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}