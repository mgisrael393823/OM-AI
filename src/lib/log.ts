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
  
  // BACKWARD COMPATIBILITY: Support both naming conventions
  requestId?: string        // Preferred field (new)
  /** @deprecated Use requestId instead. Will be removed in next major version. */
  request_id?: string      // Legacy field for backward compatibility
  
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
 * Normalizes log fields to handle backward compatibility between requestId and request_id
 * CRITICAL: Prevents crashes from mixed naming conventions during migration
 * @param fields LogFields with potential mixed naming
 * @returns Normalized fields with proper requestId/request_id handling
 */
function normalizeLogFields(fields: LogFields): LogFields {
  const normalized = { ...fields };
  
  // CRITICAL: Handle backward compatibility - migrate request_id → requestId
  if (normalized.request_id && !normalized.requestId) {
    normalized.requestId = normalized.request_id;
    // Keep request_id for log output compatibility
  }
  
  // If only requestId is provided, also set request_id for legacy log consumers
  if (normalized.requestId && !normalized.request_id) {
    normalized.request_id = normalized.requestId;
  }
  
  // Require at least one request ID field
  if (!normalized.requestId && !normalized.request_id) {
    throw new Error('LogFields must include requestId (or legacy request_id)');
  }
  
  return normalized;
}

/**
 * Emit structured log with consistent format
 * Supports both requestId (preferred) and request_id (legacy) fields
 */
export function structuredLog(
  level: LogLevel,
  message: string,
  fields: LogFields
): void {
  // CRITICAL: Normalize fields to prevent crashes from mixed naming
  const normalizedFields = normalizeLogFields(fields);
  // Build strongly typed log entry
  const base: LogEntry = {
    documentId: normalizedFields.documentId,
    userId: normalizedFields.userId,
    pid: process.pid,
    timestamp: new Date().toISOString(),
    level,
    message,
    request_id: normalizedFields.request_id,
    kvWrite: normalizedFields.kvWrite,
    kvRead: normalizedFields.kvRead,
    parts: normalizedFields.parts,
    status: normalizedFields.status,
    error: normalizedFields.error,
    adapter: normalizedFields.adapter as ('vercel-kv' | 'memory' | undefined)
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