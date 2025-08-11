/**
 * Text-only PDF page extraction using pdfjs-dist
 * Focused on text extraction without image rendering dependencies
 */

// Remove type import to avoid dependency issues
// import type { PDFPageProxy } from 'pdfjs-dist';

interface ExtractionOptions {
  textThreshold?: number;
  pageNumber?: number;
}

/**
 * Extract text from PDF page with pdfjs-dist
 */
async function extractWithPdfjs(page: any): Promise<string> {
  try {
    const textContent = await page.getTextContent();
    const textItems = textContent.items
      .filter((item: any) => item.str && item.str.trim())
      .map((item: any) => item.str);
    
    return textItems.join(' ').trim();
  } catch (error) {
    console.error('[OM-AI] Error extracting text with pdfjs:', error);
    return '';
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
 * Text-only PDF page extraction function
 * Uses pdfjs-dist for text extraction with enhanced processing
 */
export async function extractPageText(
  page: any,
  options: ExtractionOptions = {}
): Promise<string> {
  const { 
    textThreshold = 50,
    pageNumber = 0 
  } = options;
  
  // Extract text using pdfjs-dist
  const pdfjsText = await extractWithPdfjs(page);
  
  // Apply text cleaning for better quality
  const cleanedText = cleanFinancialText(pdfjsText);
  
  // Log extraction info for debugging
  const alphaNumeric = cleanedText.replace(/[^A-Za-z0-9]/g, '').length;
  const totalChars = cleanedText.length;
  
  if (totalChars < textThreshold) {
    console.warn(`[OM-AI] Page ${pageNumber} has minimal text content (${totalChars} chars, ${alphaNumeric} alphanumeric)`);
  } else {
    console.log(`[OM-AI] Page ${pageNumber} extracted: ${totalChars} chars (${alphaNumeric} alphanumeric)`);
  }
  
  return cleanedText;
}

/**
 * Extract text from multiple pages with progress tracking
 */
export async function extractPagesText(
  pages: any[], // PDFPageProxy[] but avoiding type import
  options: ExtractionOptions = {},
  onProgress?: (current: number, total: number) => void
): Promise<string[]> {
  const results: string[] = [];
  
  for (let i = 0; i < pages.length; i++) {
    const text = await extractPageText(pages[i], {
      ...options,
      pageNumber: i + 1
    });
    
    results.push(text);
    
    if (onProgress) {
      onProgress(i + 1, pages.length);
    }
  }
  
  return results;
}