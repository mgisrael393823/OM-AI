/**
 * Text-only PDF page extraction using pdfjs-dist
 * Focused on text extraction without image rendering dependencies
 * Includes timeout handling and null guards for robust processing
 */

// Remove type import to avoid dependency issues
// import type { PDFPageProxy } from 'pdfjs-dist';

interface ExtractionOptions {
  textThreshold?: number;
  pageNumber?: number;
}

/**
 * Extract text from PDF page with pdfjs-dist with timeout protection
 */
async function extractWithPdfjs(page: any): Promise<string> {
  try {
    // Add 10-second timeout for page text extraction
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Page text extraction timeout')), 10000)
    })
    
    const textContent = await Promise.race([
      page.getTextContent(),
      timeoutPromise
    ])
    
    // Guard against null or missing textContent
    if (!textContent || !textContent.items) {
      console.warn('[OM-AI] Page has no text content items')
      return ''
    }
    
    const textItems = textContent.items
      .filter((item: any) => item && item.str && typeof item.str === 'string' && item.str.trim())
      .map((item: any) => item.str)
    
    return textItems.join(' ').trim()
  } catch (error: any) {
    if (error.message?.includes('timeout')) {
      console.error('[OM-AI] Page text extraction timed out after 10s')
      return '' // Skip page instead of failing entire document
    }
    console.error('[OM-AI] Error extracting text with pdfjs:', error)
    return '' // Skip page instead of throwing
  }
}

/**
 * Enhanced text cleaning for financial documents
 */
function cleanFinancialText(text: string): string {
  return text
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    // Fix common formatting issues
    .replace(/\n{3,}/g, '\n\n')
    // Clean up common spacing issues around financial symbols
    .replace(/\$\s+/g, '$')
    .replace(/\s+%/g, '%')
    .replace(/,\s*(?=\d)/g, ',')
    .trim();
}

/**
 * Text-only PDF page extraction function with timeout and null guards
 * Uses pdfjs-dist for text extraction with enhanced processing
 */
export async function extractPageText(
  page: any,
  options: ExtractionOptions = {}
): Promise<string> {
  const { 
    textThreshold = 50,
    pageNumber = 0 
  } = options
  
  // Guard against null/undefined page
  if (!page) {
    console.warn(`[OM-AI] Page ${pageNumber} is null or undefined, skipping`)
    return ''
  }
  
  try {
    // Extract text using pdfjs-dist with timeout protection
    const pdfjsText = await extractWithPdfjs(page)
    
    // Guard against null text result
    if (typeof pdfjsText !== 'string') {
      console.warn(`[OM-AI] Page ${pageNumber} returned non-string text, skipping`)
      return ''
    }
    
    // Apply text cleaning for better quality
    const cleanedText = cleanFinancialText(pdfjsText)
    
    // Log extraction info for debugging
    const alphaNumeric = cleanedText.replace(/[^A-Za-z0-9]/g, '').length
    const totalChars = cleanedText.length
    
    if (totalChars < textThreshold) {
      console.warn(`[OM-AI] Page ${pageNumber} has minimal text content (${totalChars} chars, ${alphaNumeric} alphanumeric)`)
    } else {
      console.log(`[OM-AI] Page ${pageNumber} extracted: ${totalChars} chars (${alphaNumeric} alphanumeric)`)
    }
    
    return cleanedText
  } catch (error: any) {
    if (error.message?.includes('timeout')) {
      console.error(`[OM-AI] Page ${pageNumber} processing timed out, skipping`)
    } else {
      console.error(`[OM-AI] Error processing page ${pageNumber}:`, error)
    }
    return '' // Skip problematic pages instead of failing entire document
  }
}

/**
 * Extract text from multiple pages with progress tracking and timeout handling
 */
export async function extractPagesText(
  pages: any[], // PDFPageProxy[] but avoiding type import
  options: ExtractionOptions = {},
  onProgress?: (current: number, total: number) => void
): Promise<string[]> {
  const results: string[] = []
  
  // Guard against null/empty pages array
  if (!pages || !Array.isArray(pages)) {
    console.warn('[OM-AI] Pages array is null or not an array')
    return []
  }
  
  for (let i = 0; i < pages.length; i++) {
    try {
      const text = await extractPageText(pages[i], {
        ...options,
        pageNumber: i + 1
      })
      
      results.push(text)
      
      if (onProgress) {
        onProgress(i + 1, pages.length)
      }
    } catch (error: any) {
      console.error(`[OM-AI] Failed to extract text from page ${i + 1}:`, error)
      results.push('') // Add empty string for failed page to maintain array indices
      
      if (onProgress) {
        onProgress(i + 1, pages.length)
      }
    }
  }
  
  return results
}