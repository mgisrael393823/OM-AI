/**
 * Intent Classification for Chat Requests
 * 
 * Determines whether a user query requires document context or can be 
 * handled as general chat. Includes confidence scoring and comparison detection.
 */

export interface IntentClassification {
  type: 'document' | 'general'
  confidence: number  // 0-1
  requiresComparison?: boolean
  detectedPatterns?: string[]
  classificationTime?: number
}

// Commercial real estate and document-specific triggers
const CRE_DOCUMENT_PATTERNS = [
  // Deal analysis terms
  /\b(deal\s+points|key\s+data\s+points|summary|extract|metrics)\b/i,
  /\b(financials|noi|cap\s+rate|comps|rent\s+roll)\b/i,
  /\b(lease(s|d)?|lease\s+abstract|zoning|site\s+plan)\b/i,
  /\b(risks?|governance|terms?|offering\s+memorandum)\b/i,
  /\b(om\b|psa|loi|term\s+sheet|executive\s+summary)\b/i,
  /\b(at-a-glance|transaction\s+summary|investment\s+highlights)\b/i,
  
  // Analysis commands
  /\b(analyze|summarize|review|examine|assess)\b/i,
  /\b(what\s+(is|are)\s+the|tell\s+me\s+about\s+the)\b/i,
  /\b(show\s+me|give\s+me|provide)\b/i,
  // Page/document navigation patterns
  /\bwhat\s+is\s+on\s+page\b/i,
  /\btell\s+me\s+about\s+this\b/i,
  // Document-specific patterns
  /\bsummarize\s+(this|the)\s+document\b/i,
  /\banalyze\s+(this|the)\s+document\b/i
]

// Page references - explicit document navigation
const PAGE_REFERENCE_PATTERN = /\bpage\s*\d+\b|\bp\.\s*\d+\b/i

// Multi-document comparison detection
const COMPARISON_PATTERN = /(compare|versus|vs\.?|diff(erence)?s?|against)\b/i

// Pronoun patterns that suggest document reference
const PRONOUN_PATTERNS = [
  /\b(this|that|these|those)\s+/i,
  /\bin\s+(this|that)\b/i,
  /\bof\s+(this|that)\b/i
]

// False positive guards - avoid document classification for common phrases
const FALSE_POSITIVE_GUARDS = [
  // Tax filing and general filing contexts
  /\bfile\s+(taxes?|a\s+complaint|for|with|claim)\b/i,
  /\bhow\s+do\s+i\s+file\s+taxes?\b/i,
  // General questions about concepts (but not document references)
  /\bwhat\s+is\s+a\s+/i, // "what is a property" but not "what is on page"
  /\bhow\s+do(es)?\s+/i,
  /\bwhy\s+do(es)?\s+/i,
  // General help requests
  /\b(help|assist|guide|tutorial|instructions|getting\s+started)\b/i,
  // Upload/document management
  /\bupload\s+(a\s+)?document\b/i
]

// Cached patterns for performance
const COMPILED_PATTERNS = {
  cre: CRE_DOCUMENT_PATTERNS,
  page: PAGE_REFERENCE_PATTERN,
  comparison: COMPARISON_PATTERN,
  pronouns: PRONOUN_PATTERNS,
  guards: FALSE_POSITIVE_GUARDS
}

/**
 * Classify user intent with confidence scoring
 */
export function classifyIntent(
  query: string, 
  hasDocumentId: boolean = false,
  clientOverride?: boolean
): IntentClassification {
  const startTime = Date.now()
  const lowerQuery = query.toLowerCase()
  const detectedPatterns: string[] = []
  let confidence = 0
  let requiresComparison = false

  // Client override forces document classification
  if (clientOverride === true) {
    return {
      type: 'document',
      confidence: 1.0,
      detectedPatterns: ['client_override'],
      classificationTime: Math.max(1, Date.now() - startTime)
    }
  }

  // Check for false positives first (but allow page refs and pronouns to override)
  let hasBlockingFalsePositive = false
  COMPILED_PATTERNS.guards.forEach(pattern => {
    if (pattern.test(query)) {
      detectedPatterns.push(`guard:${pattern.source.substring(0, 20)}...`)
      // Only block if it's not a page reference or pronoun with doc
      if (!COMPILED_PATTERNS.page.test(query) && 
          !(hasDocumentId && COMPILED_PATTERNS.pronouns.some(p => p.test(query)))) {
        hasBlockingFalsePositive = true
      }
    }
  })

  if (hasBlockingFalsePositive) {
    return {
      type: 'general',
      confidence: 0.9,
      detectedPatterns,
      classificationTime: Math.max(1, Date.now() - startTime)
    }
  }

  // Check for explicit CRE/document patterns
  const creMatches = COMPILED_PATTERNS.cre.filter(pattern => {
    const match = pattern.test(query)
    if (match) {
      detectedPatterns.push(`cre:${pattern.source.substring(0, 30)}...`)
      confidence += 0.3
    }
    return match
  })

  // Check for page references
  if (COMPILED_PATTERNS.page.test(query)) {
    detectedPatterns.push('page_reference')
    confidence += 0.4
  }

  // Check for comparison queries
  if (COMPILED_PATTERNS.comparison.test(query)) {
    detectedPatterns.push('comparison')
    requiresComparison = true
    confidence += 0.3
  }

  // Check for pronouns when document is available
  if (hasDocumentId) {
    COMPILED_PATTERNS.pronouns.forEach(pattern => {
      if (pattern.test(query)) {
        detectedPatterns.push(`pronoun:${pattern.source.substring(0, 20)}...`)
        confidence += 0.2
      }
    })
  }

  // Don't cap confidence yet - let multi-pattern queries accumulate higher scores
  // confidence = Math.min(1.2, confidence)

  // Classification decision
  const type = confidence >= 0.3 ? 'document' : 'general'

  // If classified as document but no documentId and confidence is low, 
  // downgrade to general with lower confidence
  if (type === 'document' && !hasDocumentId && confidence < 0.5) {
    return {
      type: 'general',
      confidence: Math.max(0.3, 1.0 - confidence),
      detectedPatterns,
      classificationTime: Math.max(1, Date.now() - startTime)
    }
  }

  return {
    type,
    confidence: Math.min(1.0, confidence), // Cap final confidence to 1.0
    requiresComparison,
    detectedPatterns,
    classificationTime: Math.max(1, Date.now() - startTime) // Ensure at least 1ms
  }
}

/**
 * Simplified comparison query detection
 */
export function isComparisonQuery(query: string): boolean {
  return COMPILED_PATTERNS.comparison.test(query)
}

/**
 * Check if query requires document context
 * Legacy compatibility function
 */
export function requiresDocumentContext(query: string, hasDocumentId: boolean = false): boolean {
  const classification = classifyIntent(query, hasDocumentId)
  return classification.type === 'document'
}

/**
 * Get high-confidence document queries
 */
export function isHighConfidenceDocumentQuery(query: string, hasDocumentId: boolean = false): boolean {
  const classification = classifyIntent(query, hasDocumentId)
  return classification.type === 'document' && classification.confidence >= 0.7
}

/**
 * Cache key for storing classification results per request
 */
export function getClassificationCacheKey(query: string, hasDocumentId: boolean): string {
  // Simple hash of query + hasDocumentId state
  const content = `${query}:${hasDocumentId}`
  return `intent_classification:${Buffer.from(content).toString('base64').substring(0, 32)}`
}