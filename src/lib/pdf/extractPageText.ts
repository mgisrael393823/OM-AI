/**
 * Unified PDF page text extraction with OCR fallback
 * Handles both text-rich and image-heavy pages
 */

// Remove type import to avoid dependency issues
// import type { PDFPageProxy } from 'pdfjs-dist';

interface ExtractionOptions {
  dpi?: number;
  ocrThreshold?: number;
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
 * Render PDF page to image for OCR processing using Node Canvas
 */
export async function renderPageToImage(page: any, options: { dpi: number } = { dpi: 300 }): Promise<Buffer> {
  try {
    // Calculate scale based on DPI (default PDF is 72 DPI)
    const scale = options.dpi / 72;
    const viewport = page.getViewport({ scale });
    
    // Try to use Node Canvas for server-side rendering
    let Canvas: any;
    try {
      Canvas = require('canvas');
    } catch (e) {
      throw new Error('Canvas not available for OCR');
    }
    
    const canvas = Canvas.createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');
    
    // Create canvas factory for PDF.js
    const canvasFactory = {
      create: (width: number, height: number) => {
        canvas.width = width;
        canvas.height = height;
        return { canvas, context };
      },
      reset: (canvasAndContext: any, width: number, height: number) => {
        canvasAndContext.canvas.width = width;
        canvasAndContext.canvas.height = height;
      },
      destroy: (canvasAndContext: any) => {
        canvasAndContext.canvas.width = 0;
        canvasAndContext.canvas.height = 0;
      }
    };
    
    // Render PDF page to canvas
    await page.render({
      canvasContext: context,
      viewport: viewport,
      canvasFactory: canvasFactory
    }).promise;
    
    // Convert to PNG buffer
    return canvas.toBuffer('image/png');
  } catch (error: any) {
    console.warn('[OM-AI] Canvas render failed:', error?.message || error);
    throw error;
  }
}

/**
 * Perform OCR on image using Tesseract
 */
async function tesseractRecognize(
  imageBuffer: Buffer, 
  options: {
    lang: string;
    oem: number;
    psm: number;
    tessedit_char_whitelist: string;
  }
): Promise<{ data: { text: string; confidence: number } }> {
  try {
    // Dynamic import to reduce bundle size
    const Tesseract = await import('tesseract.js');
    const { createWorker } = Tesseract;
    
    const worker = await createWorker(options.lang, options.oem);
    
    await worker.setParameters({
      tessedit_char_whitelist: options.tessedit_char_whitelist,
      tessedit_pageseg_mode: options.psm,
      preserve_interword_spaces: '1'
    });
    
    const result = await worker.recognize(imageBuffer);
    await worker.terminate();
    
    return {
      data: {
        text: result.data.text,
        confidence: result.data.confidence
      }
    };
  } catch (error) {
    console.error('[OM-AI] OCR error:', error);
    return { data: { text: '', confidence: 0 } };
  }
}

/**
 * Normalize OCR text output
 */
function normalizeOcr(text: string): string {
  return text
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    // Fix common OCR mistakes
    .replace(/\bl\b/g, '1')  // Standalone 'l' often means '1'
    .replace(/\bO\b/g, '0')  // Standalone 'O' often means '0'
    // Clean up formatting
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Main extraction function with OCR fallback
 * Uses pdfjs for text extraction, falls back to OCR for low-text pages
 */
export async function extractPageText(
  page: any,
  options: ExtractionOptions = {}
): Promise<string> {
  const { 
    dpi = 300, 
    ocrThreshold = 400,
    pageNumber = 0 
  } = options;
  
  // First try standard text extraction
  const pdfjsText = await extractWithPdfjs(page);
  
  // Check if we have enough alphanumeric content
  const alpha = pdfjsText.replace(/[^A-Za-z0-9$€£.,:%&()/\- \n]+/g, '');
  
  // Calculate digit ratio for table detection
  const digits = pdfjsText.replace(/[^0-9]/g, '').length;
  const digitRatio = alpha.length > 0 ? digits / alpha.length : 0;
  
  // If enough text content AND not number-heavy, return it
  const needsOCR = alpha.length < ocrThreshold || digitRatio >= 0.35;
  
  if (!needsOCR) {
    return pdfjsText;
  }
  
  // Low text content or number-heavy - try OCR if Canvas is available
  const reason = digitRatio >= 0.35 ? 'digit-heavy table' : 'low text content';
  
  let imageBuffer: Buffer | undefined;
  try {
    // Try to render page to image - will fail if Canvas not available
    imageBuffer = await renderPageToImage(page, { dpi });
  } catch (e: any) {
    console.warn(`[OM-AI] Canvas not available for page ${pageNumber}, skipping OCR:`, e?.message);
    return pdfjsText; // Fall back to pdfjs text without OCR
  }
  
  try {
    // Perform OCR with optimized settings for financial documents
    const ocrResult = await tesseractRecognize(imageBuffer, {
      lang: 'eng',
      oem: 1,  // LSTM neural net mode
      psm: 6,  // Uniform block of text
      tessedit_char_whitelist: '0123456789$€£.,:%&()/+\\- ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
    });
    
    // Combine pdfjs text (if any) with OCR results
    const normalizedOcr = normalizeOcr(ocrResult.data.text);
    const combinedText = (pdfjsText.trim() + '\n' + normalizedOcr).trim();
    
    // Log OCR usage with preview
    console.log(`[OM-AI] OCR used for page ${pageNumber} (${reason})`);
    
    return combinedText;
  } catch (ocrError: any) {
    console.warn(`[OM-AI] OCR failed for page ${pageNumber}:`, ocrError?.message || ocrError);
    // Return whatever text we got from pdfjs
    return pdfjsText;
  }
}

/**
 * Extract text from multiple pages with progress tracking
 */
export async function extractPagesText(
  pages: PDFPageProxy[],
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