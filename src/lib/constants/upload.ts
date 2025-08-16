/**
 * Single source of truth for upload size limits
 * Ensures client and server are aligned
 */

// Default upload limit in MB (can be overridden by environment variable)
const DEFAULT_MAX_UPLOAD_MB = 25;

/**
 * Get the maximum upload size limit in MB from environment or default
 * Server: Uses MAX_UPLOAD_MB
 * Client: Uses NEXT_PUBLIC_MAX_UPLOAD_MB
 */
export function getMaxUploadMB(): number {
  if (typeof window === 'undefined') {
    // Server-side: Use server environment variable
    return Number(process.env.MAX_UPLOAD_MB) || DEFAULT_MAX_UPLOAD_MB;
  } else {
    // Client-side: Use public environment variable
    return Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB) || DEFAULT_MAX_UPLOAD_MB;
  }
}

/**
 * Get the maximum upload size in bytes
 */
export function getMaxUploadBytes(): number {
  return getMaxUploadMB() * 1024 * 1024;
}

/**
 * Constants for upload validation
 */
export const UPLOAD_LIMITS = {
  get MAX_MB() { return getMaxUploadMB(); },
  get MAX_BYTES() { return getMaxUploadBytes(); },
  SUPPORTED_TYPES: ['application/pdf'],
  SUPPORTED_EXTENSIONS: ['.pdf']
} as const;