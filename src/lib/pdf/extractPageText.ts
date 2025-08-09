/**
 * Unified PDF page text extraction with OCR fallback
 * Handles both text-rich and image-heavy pages
 */

import type { PDFPageProxy } from 'pdfjs-dist';

interface ExtractionOptions {
  dpi?: number;
  ocrThreshold?: number;
  pageNumber?: number;
}

/**
 * Extract text from PDF page with pdfjs-dist
 */
async function extractWithPdfjs(page: PDFPageProxy): Promise<string> {
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
async function renderPageToImage(page: PDFPageProxy, options: { dpi: number }): Promise<Buffer> {
  try {
    // Calculate scale based on DPI (default PDF is 72 DPI)
    const scale = options.dpi / 72;
    const viewport = page.getViewport({ scale });
    
    // Use Node Canvas for server-side rendering
    const Canvas = require('canvas');
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
  } catch (error) {
    console.error('[OM-AI] Error rendering page to image:', error);
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
  page: PDFPageProxy,
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
  const alpha = pdfjsText.replace(/[^A-Za-z0-9$%.,:()/\- \n]+/g, '');
  
  // Calculate digit ratio for table detection
  const digits = pdfjsText.replace(/[^0-9]/g, '').length;
  const digitRatio = pdfjsText.length > 0 ? digits / pdfjsText.length : 0;
  
  // If enough text content AND not number-heavy, return it
  if (alpha.length >= ocrThreshold && digitRatio < 0.35) {
    return pdfjsText;
  }
  
  // Low text content or number-heavy - likely an image-heavy page or table, use OCR
  const reason = digitRatio >= 0.35 ? 'digit-heavy table' : 'low text content';
  
  try {
    // Render page to high-res image
    const imageBuffer = await renderPageToImage(page, { dpi });
    
    // Perform OCR with optimized settings for financial documents
    const ocrResult = await tesseractRecognize(imageBuffer, {
      lang: 'eng',
      oem: 1,  // LSTM neural net mode
      psm: 6,  // Uniform block of text
      tessedit_char_whitelist: '0123456789$€£.,:%&()/+\\- ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
    });
    
    // Combine pdfjs text (if any) with OCR results
    const normalizedOcr = normalizeOcr(ocrResult.data.text);
    const combinedText = pdfjsText.trim() + '\n' + normalizedOcr;
    
    // Log OCR usage with preview
    const preview = combinedText.substring(0, 80).replace(/\n/g, ' ');
    console.log(`[OM-AI] OCR used for page ${pageNumber} (${reason}): "${preview}..."`);
    
    return combinedText.trim();
  } catch (ocrError) {
    console.error(`[OM-AI] OCR failed for page ${pageNumber}:`, ocrError);
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