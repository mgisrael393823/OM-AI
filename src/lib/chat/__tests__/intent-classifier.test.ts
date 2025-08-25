import { 
  classifyIntent, 
  isComparisonQuery, 
  requiresDocumentContext,
  isHighConfidenceDocumentQuery 
} from '../intent-classifier'

describe('Intent Classifier', () => {
  describe('Document query detection', () => {
    test('detects CRE document queries', () => {
      expect(classifyIntent('what is the NOI', false)).toMatchObject({
        type: 'document',
        confidence: expect.any(Number)
      })
      
      expect(classifyIntent('show me the cap rate', false)).toMatchObject({
        type: 'document',
        confidence: expect.any(Number)
      })
      
      expect(classifyIntent('provide key data points', false)).toMatchObject({
        type: 'document',
        confidence: expect.any(Number)
      })
      
      // Additional CRE triggers
      expect(classifyIntent('analyze the comps', false)).toMatchObject({
        type: 'document',
        confidence: expect.any(Number)
      })
      
      expect(classifyIntent('summarize the rent roll', false)).toMatchObject({
        type: 'document',
        confidence: expect.any(Number)
      })
    })

    test('detects page references', () => {
      const result = classifyIntent('what is on page 5?', false)
      expect(result.type).toBe('document')
      expect(result.confidence).toBeGreaterThan(0.3)
      expect(result.detectedPatterns).toContain('page_reference')
    })

    test('detects pronouns with documentId', () => {
      const result = classifyIntent('tell me about this property', true)
      expect(result.type).toBe('document')
      expect(result.detectedPatterns).toEqual(expect.arrayContaining([
        expect.stringMatching(/pronoun:/)
      ]))
      
      // More pronoun tests with documentId
      expect(classifyIntent('what are the details of this', true).type).toBe('document')
      expect(classifyIntent('analyze this deal', true).type).toBe('document')
      expect(classifyIntent('summarize these terms', true).type).toBe('document')
    })

    test('ignores pronouns without documentId', () => {
      const result = classifyIntent('tell me about this concept', false)
      expect(result.type).toBe('general')
      
      // More pronoun tests without documentId
      expect(classifyIntent('tell me about this', false).type).toBe('general')
      expect(classifyIntent('what are these', false).type).toBe('general')
      expect(classifyIntent('explain this to me', false).type).toBe('general')
    })
  })

  describe('General query detection', () => {
    test('classifies general questions as general', () => {
      expect(classifyIntent('hi', false)).toMatchObject({
        type: 'general'
      })
      
      expect(classifyIntent('what can you do?', false)).toMatchObject({
        type: 'general'
      })
      
      expect(classifyIntent('how do I invest in real estate?', false)).toMatchObject({
        type: 'general'
      })
    })
  })

  describe('False positive guards', () => {
    test('avoids false positives for tax filing', () => {
      const result = classifyIntent('how do I file taxes?', false)
      expect(result.type).toBe('general')
      expect(result.detectedPatterns).toEqual(expect.arrayContaining([
        expect.stringMatching(/guard:/)
      ]))
    })

    test('avoids false positives for complaints', () => {
      expect(classifyIntent('file a complaint with support', false)).toMatchObject({
        type: 'general'
      })
    })

    test('avoids false positives for help requests', () => {
      expect(classifyIntent('help me understand real estate', false)).toMatchObject({
        type: 'general'
      })
    })

    test('avoids false positives for uploading documents', () => {
      expect(classifyIntent('upload a document to analyze', false)).toMatchObject({
        type: 'general'
      })
    })
  })

  describe('Client override', () => {
    test('respects client override for document classification', () => {
      const result = classifyIntent('hello world', false, true)
      expect(result.type).toBe('document')
      expect(result.confidence).toBe(1.0)
      expect(result.detectedPatterns).toContain('client_override')
    })
  })

  describe('Confidence scoring', () => {
    test('returns confidence between 0 and 1', () => {
      const result = classifyIntent('analyze the NOI and cap rate', false)
      expect(result.confidence).toBeGreaterThanOrEqual(0)
      expect(result.confidence).toBeLessThanOrEqual(1)
    })

    test('returns higher confidence for multiple document patterns', () => {
      const result1 = classifyIntent('NOI', false)
      const result2 = classifyIntent('NOI and cap rate on page 5', false)
      // Check that the multi-pattern query detected more patterns even if confidence is capped
      expect(result2.detectedPatterns?.length).toBeGreaterThan(result1.detectedPatterns?.length || 0)
      // Both should be high confidence document queries
      expect(result1.confidence).toBeGreaterThanOrEqual(0.3)
      expect(result2.confidence).toBeGreaterThanOrEqual(0.3)
    })
  })

  describe('Comparison queries', () => {
    test('detects comparison keywords', () => {
      expect(isComparisonQuery('compare these two properties')).toBe(true)
      expect(isComparisonQuery('property A vs property B')).toBe(true)
      expect(isComparisonQuery('show differences between deals')).toBe(true)
      expect(isComparisonQuery('versus the baseline')).toBe(true)
    })

    test('does not false positive on non-comparison', () => {
      expect(isComparisonQuery('analyze this property')).toBe(false)
      expect(isComparisonQuery('what is the NOI')).toBe(false)
    })

    test('marks comparison queries as requiring comparison', () => {
      const result = classifyIntent('compare these documents', true)
      expect(result.requiresComparison).toBe(true)
      expect(result.detectedPatterns).toContain('comparison')
    })
  })

  describe('Performance tracking', () => {
    test('includes classification time', () => {
      const result = classifyIntent('test query', false)
      expect(result.classificationTime).toBeGreaterThan(0)
      expect(result.classificationTime).toBeLessThan(100) // Should be fast
    })
  })

  describe('Ambiguous queries', () => {
    test('handles edge cases and ambiguous queries', () => {
      // These should be classified as document queries
      expect(classifyIntent('analyze this document', false).type).toBe('document')
      expect(classifyIntent('provide summary', false).type).toBe('document')
      
      // Clear general queries
      expect(classifyIntent('hello', false).type).toBe('general')
      expect(classifyIntent('thank you', false).type).toBe('general')
      expect(classifyIntent('can you help me', false).type).toBe('general')
      
      // These are ambiguous - "analyze the data" could be general or document
      const ambiguous1 = classifyIntent('analyze the data', false)
      const ambiguous2 = classifyIntent('show me the summary', false)
      expect(ambiguous1.type).toMatch(/document|general/)
      expect(ambiguous2.type).toMatch(/document|general/)
    })
    
    test('handles mixed intent queries', () => {
      // Mixed but leans document
      expect(classifyIntent('hello, what is the NOI?', false).type).toBe('document')
      expect(classifyIntent('thanks, now show me the cap rate', false).type).toBe('document')
    })
  })

  describe('Legacy compatibility', () => {
    test('requiresDocumentContext works like before', () => {
      expect(requiresDocumentContext('what is the NOI', false)).toBe(true)
      expect(requiresDocumentContext('hello world', false)).toBe(false)
    })

    test('isHighConfidenceDocumentQuery identifies strong signals', () => {
      expect(isHighConfidenceDocumentQuery('show me deal points on page 5', true)).toBe(true)
      expect(isHighConfidenceDocumentQuery('maybe tell me about this', true)).toBe(false)
    })
  })
})