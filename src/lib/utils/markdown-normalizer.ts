/**
 * Markdown Normalizer Utility
 * 
 * Normalizes Unicode bullets and other formatting inconsistencies in markdown content
 * to ensure consistent rendering across all chat responses.
 */

import { structuredLog } from '@/lib/log'

export interface NormalizationResult {
  content: string
  wasNormalized: boolean
  changesCount: number
  patterns: string[]
}

/**
 * Normalize Unicode bullets and other formatting inconsistencies to standard markdown
 * 
 * Features:
 * - Converts Unicode bullets (•●▪▫◦‣⁃) to markdown hyphens (-)
 * - Preserves code blocks and inline code
 * - Maintains proper line spacing for headers
 * - Handles ordered lists properly
 * - Logs when normalization occurs
 */
export function normalizeMarkdownBullets(content: string, requestId?: string): NormalizationResult {
  if (!content || typeof content !== 'string') {
    return {
      content: content || '',
      wasNormalized: false,
      changesCount: 0,
      patterns: []
    }
  }

  let normalized = content
  let changesCount = 0
  const patterns: string[] = []
  
  // Track original for comparison
  const original = content

  // Step 1: Protect code blocks and inline code from normalization
  const codeBlocks: string[] = []
  const codeBlockPlaceholder = '___CODE_BLOCK_PLACEHOLDER___'
  const inlineCodePlaceholder = '___INLINE_CODE_PLACEHOLDER___'
  
  // Extract and replace code blocks with placeholders
  normalized = normalized.replace(/```[\s\S]*?```/g, (match, offset) => {
    codeBlocks.push(match)
    return `${codeBlockPlaceholder}${codeBlocks.length - 1}`
  })
  
  // Extract and replace inline code with placeholders
  const inlineCodes: string[] = []
  normalized = normalized.replace(/`[^`\n]+`/g, (match, offset) => {
    inlineCodes.push(match)
    return `${inlineCodePlaceholder}${inlineCodes.length - 1}`
  })

  // Step 2: Normalize Unicode bullets to markdown hyphens
  // Matches: • ● ▪ ▫ ◦ ‣ ⁃ at start of line (with optional whitespace)
  const unicodeBulletsRegex = /^(\s*)[•●▪▫◦‣⁃]\s*/gm
  const unicodeBulletsMatches = [...normalized.matchAll(unicodeBulletsRegex)]
  
  if (unicodeBulletsMatches.length > 0) {
    normalized = normalized.replace(unicodeBulletsRegex, '$1- ')
    changesCount += unicodeBulletsMatches.length
    patterns.push('unicode_bullets')
  }

  // Step 3: Normalize other bullet variants (e.g., multiple dashes, weird spacing)
  const otherBulletsRegex = /^(\s*)[-−–—]{2,}\s*/gm  // Multiple dash variants
  const otherBulletsMatches = [...normalized.matchAll(otherBulletsRegex)]
  
  if (otherBulletsMatches.length > 0) {
    normalized = normalized.replace(otherBulletsRegex, '$1- ')
    changesCount += otherBulletsMatches.length
    patterns.push('multiple_dashes')
  }

  // Step 4: Ensure proper spacing after headers (but preserve existing double newlines)
  // Only add spacing if header is immediately followed by content without blank line
  const headerSpacingRegex = /^(#{1,6}\s+[^\n]+)\n(?![\n\r]|$)/gm
  const headerMatches = [...normalized.matchAll(headerSpacingRegex)]
  
  if (headerMatches.length > 0) {
    normalized = normalized.replace(headerSpacingRegex, '$1\n\n')
    changesCount += headerMatches.length
    patterns.push('header_spacing')
  }

  // Step 5: Normalize ordered list spacing (ensure single space after number/period)
  const orderedListRegex = /^(\s*)(\d+)[\.)]\s{2,}/gm
  const orderedListMatches = [...normalized.matchAll(orderedListRegex)]
  
  if (orderedListMatches.length > 0) {
    normalized = normalized.replace(orderedListRegex, '$1$2. ')
    changesCount += orderedListMatches.length
    patterns.push('ordered_list_spacing')
  }

  // Step 6: Restore code blocks and inline code
  codeBlocks.forEach((code, index) => {
    normalized = normalized.replace(`${codeBlockPlaceholder}${index}`, code)
  })
  
  inlineCodes.forEach((code, index) => {
    normalized = normalized.replace(`${inlineCodePlaceholder}${index}`, code)
  })

  const wasNormalized = changesCount > 0

  // Log normalization if it occurred
  if (wasNormalized && requestId) {
    structuredLog('info', 'Markdown normalization applied', {
      userId: 'system', // Utility function doesn't have user context
      requestId,
      changesCount,
      patterns,
      originalLength: original.length,
      normalizedLength: normalized.length
    })
  }

  return {
    content: normalized,
    wasNormalized,
    changesCount,
    patterns
  }
}

/**
 * Convenience function that returns just the normalized content
 */
export function normalizeMarkdown(content: string, requestId?: string): string {
  return normalizeMarkdownBullets(content, requestId).content
}

/**
 * Check if content needs normalization without actually normalizing it
 */
export function needsNormalization(content: string): boolean {
  if (!content || typeof content !== 'string') {
    return false
  }

  // Check for Unicode bullets
  const unicodeBulletsRegex = /^(\s*)[•●▪▫◦‣⁃]\s*/m
  if (unicodeBulletsRegex.test(content)) {
    return true
  }

  // Check for multiple dashes
  const multipleDashesRegex = /^(\s*)[-−–—]{2,}\s*/m
  if (multipleDashesRegex.test(content)) {
    return true
  }

  // Check for header spacing issues
  const headerSpacingRegex = /^(#{1,6}\s+[^\n]+)\n(?![\n\r]|$)/m
  if (headerSpacingRegex.test(content)) {
    return true
  }

  return false
}

/**
 * Normalize bullets specifically for cached dealPoints content
 * This is optimized for the dealPoints format and includes specific logging
 */
export function normalizeDealPointsContent(
  dealPoints: { bullets: string[], citations?: any[], [key: string]: any }, 
  requestId?: string
): { bullets: string[], citations?: any[], [key: string]: any } {
  const originalBullets = dealPoints.bullets || []
  const normalizedBullets = originalBullets.map(bullet => {
    // Only normalize if the bullet contains Unicode bullets at the start
    if (typeof bullet === 'string' && /^[•●▪▫◦‣⁃]\s*/.test(bullet)) {
      return bullet.replace(/^[•●▪▫◦‣⁃]\s*/, '')
    }
    return bullet
  })

  const wasNormalized = normalizedBullets.some((bullet, index) => bullet !== originalBullets[index])

  if (wasNormalized && requestId) {
    structuredLog('info', 'DealPoints bullets normalized', {
      requestId,
      originalCount: originalBullets.length,
      normalizedCount: normalizedBullets.length,
      source: 'cached_dealpoints'
    })
  }

  return {
    ...dealPoints,
    bullets: normalizedBullets
  }
}