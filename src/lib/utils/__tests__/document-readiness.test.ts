import {
  computeRequiredParts,
  calculateRetryAfter,
  getReadinessPercent,
  estimateCompletionTime,
  isDocumentReady,
  getDocumentReadinessSummary
} from '../document-readiness'

describe('Document Readiness Utils', () => {
  describe('computeRequiredParts', () => {
    beforeEach(() => {
      delete process.env.MIN_PARTS
    })

    test('uses default minimum of 5 parts', () => {
      expect(computeRequiredParts(20)).toBe(5) // min(5, max(1, ceil(20/2)))
    })

    test('adapts to small documents', () => {
      expect(computeRequiredParts(1)).toBe(1)  // min(5, max(1, ceil(1/2)))
      expect(computeRequiredParts(2)).toBe(1)  // min(5, max(1, ceil(2/2))) 
      expect(computeRequiredParts(3)).toBe(2)  // min(5, max(1, ceil(3/2)))
    })

    test('respects environment variable', () => {
      process.env.MIN_PARTS = '3'
      expect(computeRequiredParts(10)).toBe(3) // min(3, max(1, ceil(10/2)))
    })

    test('respects envMin parameter', () => {
      expect(computeRequiredParts(10, 2)).toBe(2) // min(2, max(1, ceil(10/2)))
    })

    test('handles edge cases', () => {
      expect(computeRequiredParts(0)).toBe(1)   // Always require at least 1
      expect(computeRequiredParts(-1)).toBe(1)  // Handle negative input
    })
  })

  describe('calculateRetryAfter', () => {
    test('returns time between 1-5 seconds', () => {
      expect(calculateRetryAfter(0, 1)).toBe(1)
      expect(calculateRetryAfter(0, 5)).toBe(5)
      expect(calculateRetryAfter(0, 10)).toBe(5) // Capped at 5
      expect(calculateRetryAfter(2, 3)).toBe(1)  // Only 1 remaining
    })

    test('handles edge cases', () => {
      expect(calculateRetryAfter(5, 3)).toBe(1)  // More parts than required
      expect(calculateRetryAfter(0, 0)).toBe(1)  // No parts required
    })
  })

  describe('getReadinessPercent', () => {
    test('calculates correct percentages', () => {
      expect(getReadinessPercent(0, 5)).toBe(0)
      expect(getReadinessPercent(2, 5)).toBe(40)
      expect(getReadinessPercent(5, 5)).toBe(100)
      expect(getReadinessPercent(6, 5)).toBe(100) // Capped at 100
    })

    test('handles zero required parts', () => {
      expect(getReadinessPercent(0, 0)).toBe(100)
      expect(getReadinessPercent(5, 0)).toBe(100)
    })
  })

  describe('estimateCompletionTime', () => {
    test('estimates based on remaining parts', () => {
      expect(estimateCompletionTime(2, 5)).toBe(6) // 3 remaining * 2 seconds
      expect(estimateCompletionTime(4, 5)).toBe(2) // 1 remaining, min 2 seconds
      expect(estimateCompletionTime(5, 5)).toBe(0) // Complete
    })

    test('respects custom time per part', () => {
      expect(estimateCompletionTime(0, 5, 3)).toBe(15) // 5 * 3 seconds
    })
  })

  describe('isDocumentReady', () => {
    test('checks status and parts', () => {
      expect(isDocumentReady('ready', 5, 5)).toBe(true)
      expect(isDocumentReady('ready', 3, 5)).toBe(false)
      expect(isDocumentReady('processing', 5, 5)).toBe(false)
      expect(isDocumentReady('error', 5, 5)).toBe(false)
    })
  })

  describe('getDocumentReadinessSummary', () => {
    test('returns complete summary for processing document', () => {
      const summary = getDocumentReadinessSummary('processing', 2, 8)
      
      expect(summary).toEqual({
        status: 'processing',
        parts: 2,
        requiredParts: 4, // min(5, max(1, ceil(8/2)))
        percentReady: 50,  // 2/4 * 100
        isReady: false,
        estimatedTimeSeconds: 4, // (4-2) * 2
        retryAfterSeconds: 2     // min(5, max(1, 4-2))
      })
    })

    test('returns summary for ready document', () => {
      const summary = getDocumentReadinessSummary('ready', 5, 10)
      
      expect(summary).toEqual({
        status: 'ready',
        parts: 5,
        requiredParts: 5,
        percentReady: 100,
        isReady: true
        // No timing fields for ready docs
      })
    })

    test('handles small documents correctly', () => {
      const summary = getDocumentReadinessSummary('ready', 1, 1)
      
      expect(summary.requiredParts).toBe(1)
      expect(summary.isReady).toBe(true)
    })

    test('handles error status', () => {
      const summary = getDocumentReadinessSummary('error', 0, 5)
      
      expect(summary.status).toBe('error')
      expect(summary.isReady).toBe(false)
      expect(summary.estimatedTimeSeconds).toBeUndefined()
    })
  })
})