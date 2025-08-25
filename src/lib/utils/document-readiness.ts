/**
 * Document Readiness Utilities
 * 
 * Shared logic for determining when documents are ready for queries
 * and calculating retry timing.
 */

/**
 * Compute required parts based on document size and environment settings
 */
export function computeRequiredParts(pagesIndexed: number, envMin?: number): number {
  const MIN_PARTS = parseInt(process.env.MIN_PARTS || envMin?.toString() || '5', 10)
  
  // For small documents (≤3 pages), require at least 1 part
  // For larger documents, require half the pages indexed, up to the env minimum
  return Math.min(MIN_PARTS, Math.max(1, Math.ceil(pagesIndexed / 2)))
}

/**
 * Calculate dynamic retry-after delay based on remaining parts
 */
export function calculateRetryAfter(parts: number, requiredParts: number): number {
  const remaining = requiredParts - (parts || 0)
  
  // Retry-After between 1-5 seconds based on how much is left
  return Math.max(1, Math.min(5, remaining))
}

/**
 * Get document readiness percentage
 */
export function getReadinessPercent(parts: number, requiredParts: number): number {
  if (requiredParts === 0) return 100
  return Math.min(100, Math.round(((parts || 0) / requiredParts) * 100))
}

/**
 * Estimate completion time in seconds
 */
export function estimateCompletionTime(parts: number, requiredParts: number, baseTimePerPart: number = 2): number {
  const remaining = Math.max(0, requiredParts - (parts || 0))
  
  if (remaining === 0) return 0
  
  // Base estimate: 2 seconds per part, minimum 2 seconds
  return Math.max(2, remaining * baseTimePerPart)
}

/**
 * Check if document meets minimum readiness criteria
 */
export function isDocumentReady(status: string, parts: number, requiredParts: number): boolean {
  return status === 'ready' && (parts || 0) >= requiredParts
}

/**
 * Get document status summary with readiness metrics
 */
export interface DocumentReadinessSummary {
  status: string
  parts: number
  requiredParts: number
  percentReady: number
  isReady: boolean
  estimatedTimeSeconds?: number
  retryAfterSeconds?: number
}

export function getDocumentReadinessSummary(
  status: string,
  parts: number = 0,
  pagesIndexed: number = 0,
  envMin?: number
): DocumentReadinessSummary {
  const requiredParts = computeRequiredParts(pagesIndexed, envMin)
  const percentReady = getReadinessPercent(parts, requiredParts)
  const isReady = isDocumentReady(status, parts, requiredParts)
  
  const summary: DocumentReadinessSummary = {
    status,
    parts,
    requiredParts,
    percentReady,
    isReady
  }
  
  // Add timing estimates if still processing
  if (!isReady && status === 'processing') {
    summary.estimatedTimeSeconds = estimateCompletionTime(parts, requiredParts)
    summary.retryAfterSeconds = calculateRetryAfter(parts, requiredParts)
  }
  
  return summary
}