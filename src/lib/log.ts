/**
 * Structured Logging Helper
 * 
 * Provides consistent logging format across all API endpoints
 * for debugging and monitoring cross-runtime context operations
 */

export interface LogFields {
  documentId?: string
  userId: string
  kvWrite?: boolean
  kvRead?: boolean
  parts?: number
  status?: string
  error?: string
  request_id: string
  [key: string]: any // Allow additional fields for backward compatibility
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

// Strongly typed internal log entry
interface LogEntry {
  documentId?: string     // Optional
  userId: string          // Required
  pid: number            // Required
  timestamp?: string     // Optional
  level?: LogLevel       // Optional
  message?: string       // Optional
  request_id?: string    // Optional
  kvWrite?: boolean      // Optional
  kvRead?: boolean       // Optional
  parts?: number         // Optional
  status?: string        // Optional
  error?: string         // Optional
  adapter?: 'vercel-kv' | 'memory' // Optional
  endpoint?: string      // Optional
}

/**
 * Convert LogEntry to clean record without undefined values
 */
function toCleanRecord(entry: LogEntry): Record<string, unknown> {
  return Object.entries(entry)
    .filter(([_, value]) => value !== undefined)
    .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {})
}

/**
 * Emit structured log with consistent format
 */
export function structuredLog(
  level: LogLevel,
  message: string,
  fields: LogFields
): void {
  // Build strongly typed log entry
  const base: LogEntry = {
    documentId: fields.documentId,
    userId: fields.userId,
    pid: process.pid,
    timestamp: new Date().toISOString(),
    level,
    message,
    request_id: fields.request_id,
    kvWrite: fields.kvWrite,
    kvRead: fields.kvRead,
    parts: fields.parts,
    status: fields.status,
    error: fields.error,
    adapter: fields.adapter as ('vercel-kv' | 'memory' | undefined)
  }
  
  // Convert to clean record without undefined values
  const clean = toCleanRecord(base)
  
  // Format for console output - extract specific fields for display
  const displayFields: Record<string, unknown> = {
    userId: clean.userId,
    request_id: clean.request_id
  }
  
  // Add documentId if present
  if (clean.documentId !== undefined) displayFields.documentId = clean.documentId
  
  // Add optional fields if present
  if (clean.kvWrite !== undefined) displayFields.kvWrite = clean.kvWrite
  if (clean.kvRead !== undefined) displayFields.kvRead = clean.kvRead
  if (clean.parts !== undefined) displayFields.parts = clean.parts
  if (clean.status !== undefined) displayFields.status = clean.status
  if (clean.error !== undefined) displayFields.error = clean.error
  if (clean.adapter !== undefined) displayFields.adapter = clean.adapter
  
  const logString = `[${level.toUpperCase()}] ${message} | ${JSON.stringify(displayFields)}`
  
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