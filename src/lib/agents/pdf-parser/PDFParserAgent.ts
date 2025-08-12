// Side-effect import to ensure worker is bundled
import 'pdfjs-dist/legacy/build/pdf.worker.js';

import { PdfReader, PdfReaderItem } from 'pdfreader';
import { v4 as uuidv4 } from 'uuid';
import { 
  ParsedText, 
  ParsedTable, 
  ParsedPage, 
  PDFMetadata, 
  ParseOptions, 
  ParseResult, 
  TextChunk, 
  IPDFParserAgent 
} from './types';
import { OCRProcessor, PDFAnalyzer, TextProcessor } from './utils';
import { safeLoadCanvas, isCanvasAvailable } from '@/lib/canvas-loader';

const ENABLE_PDF_OCR = process.env.ENABLE_PDF_OCR === 'true';

// Module-level singleton for pdf.js
let pdfjsLib: any = null;
let workerInitialized = false;

/**
 * Initialize pdf.js once and cache it
 */
async function initPdfJs(): Promise<any> {
  if (pdfjsLib && workerInitialized) {
    return pdfjsLib;
  }
  
  try {
    pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js');
    if (!workerInitialized) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.js';
      workerInitialized = true;
      console.log('[PDFParserAgent] Initialized pdfjs-dist legacy build (worker configured once)');
    }
  } catch {
    // @ts-expect-error - pdfjs legacy build types don't match runtime default export
    const mod = await import('pdfjs-dist/build/pdf.js');
    pdfjsLib = (mod as any).default ?? mod;
    if (!workerInitialized) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/build/pdf.worker.js';
      workerInitialized = true;
      console.log('[PDFParserAgent] Initialized pdfjs-dist standard build (worker configured once)');
    }
  }
  
  return pdfjsLib;
}

// Ensures we return a plain Uint8Array (never a Node Buffer)
function toPlainUint8Array(d: ArrayBuffer | Uint8Array | Buffer): Uint8Array {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const B: any = typeof Buffer !== 'undefined' ? Buffer : null;
  if (d instanceof Uint8Array && !(B && B.isBuffer && B.isBuffer(d))) return d;
  if (B && B.isBuffer && B.isBuffer(d)) return new Uint8Array((d as any).buffer, (d as any).byteOffset, d.byteLength);
  if (d instanceof ArrayBuffer) return new Uint8Array(d);
  // Last resort copy for array-like objects that TypeScript can't properly type
  return Uint8Array.from(d as any);
}

// Text-only PDF processing - no Canvas dependencies required

export class PDFParserAgent implements IPDFParserAgent {
  private ocrProcessor: OCRProcessor | null = null;
  private defaultOptions: ParseOptions = {
    extractTables: true,
    performOCR: false,
    ocrConfidenceThreshold: 70,
    chunkSize: 4000,
    preserveFormatting: true
  };

  constructor() {
    this.ocrProcessor = new OCRProcessor();
  }

  async parseBuffer(buffer: Buffer, options?: Partial<ParseOptions>): Promise<ParseResult> {
    const startTime = Date.now();
    const config = { ...this.defaultOptions, ...options };
    
    console.log('[PDFParserAgent] Starting parse, buffer size:', buffer.length, 'useCanvas:', config.useCanvas);
    
    try {
      // Convert to plain Uint8Array for pdfjs-dist
      const data = toPlainUint8Array(buffer);
      
      // Initialize pdf.js with singleton
      const pdfjsLib = await initPdfJs();
      
      // Configure pdf.js for text-only mode when canvas is disabled
      const loadingOptions: any = {
        data,
        // Text-only optimizations when USE_CANVAS=false
        disableFontFace: !config.useCanvas,  // Skip font loading in text-only mode
        isEvalSupported: false,               // Disable eval for security
        useSystemFonts: false,                // Don't use system fonts
        useWorkerFetch: false,                // Avoid worker font fetching
        standardFontDataUrl: null,            // Skip standard font loading
        cMapUrl: null,                        // Skip character map loading
        disableAutoFetch: true,               // Don't auto-fetch resources
        disableStream: false,                 // Keep streaming for performance
        verbosity: config.useCanvas ? 1 : 0   // Suppress warnings in text-only mode (0 = errors only)
      };
      
      console.log('[PDFParserAgent] Loading document with options:', {
        disableFontFace: loadingOptions.disableFontFace,
        verbosity: loadingOptions.verbosity,
        mode: config.useCanvas ? 'enhanced' : 'text-only'
      });
      
      const loadingTask = pdfjsLib.getDocument(loadingOptions);
      const pdfDocument = await loadingTask.promise;
      console.log('[PDFParserAgent] PDF loaded, pages:', pdfDocument.numPages);
      
      // Extract basic PDF structure for metadata
      const { items, metadata } = await this.extractPDFItems(buffer);
      metadata.pages = pdfDocument.numPages;
      
      // Process pages concurrently with controlled concurrency
      const CONCURRENT_PAGES = 5; // Safe concurrency limit
      const numPages = Math.min(pdfDocument.numPages, config.maxPages || pdfDocument.numPages);
      const pages: ParsedPage[] = [];
      let hasAnyText = false;
      
      console.log(`[PDFParserAgent] Processing ${numPages} pages with concurrency of ${CONCURRENT_PAGES}`);
      
      try {
        // Process pages in concurrent batches
        for (let i = 0; i < numPages; i += CONCURRENT_PAGES) {
          const batchStart = i;
          const batchEnd = Math.min(i + CONCURRENT_PAGES, numPages);
          const batchPromises: Promise<ParsedPage>[] = [];
          
          // Create batch of page processing promises
          for (let pageNumber = batchStart + 1; pageNumber <= batchEnd; pageNumber++) {
            batchPromises.push(this.processPage(pdfDocument, pageNumber, config));
          }
          
          // Wait for batch to complete
          const batchResults = await Promise.all(batchPromises);
          
          // Add results in order
          for (const page of batchResults) {
            if (page.text) hasAnyText = true;
            pages.push(page);
          }
          
          console.log(`[PDFParserAgent] Processed batch ${batchStart + 1}-${batchEnd} of ${numPages}`);
        }
      } finally {
        // Cleanup
        await pdfDocument.destroy();
      }
      
      // Check if we got any text at all
      if (!hasAnyText) {
        const err = new Error('No extractable text in PDF (image-only).');
        // @ts-expect-error - intentional runtime mismatch
        err.code = 'NO_PDF_TEXT';
        throw err;
      }

      // Extract all tables across pages
      const allTables: ParsedTable[] = [];
      const allText: string[] = [];
      
      for (const page of pages) {
        allTables.push(...page.tables);
        allText.push(page.text);
      }

      // Create text chunks for embedding/search with optimized size for better granularity
      const fullText = allText.join('\n\n');
      const chunks = this.chunkText(fullText, 800, pages); // Use 800 tokens for better granularity

      if (chunks.length === 0) {
        const err = new Error('Document processing produced no chunks.');
        // @ts-expect-error - intentional runtime mismatch
        err.code = 'NO_CHUNKS';
        throw err;
      }

      const processingTime = Date.now() - startTime;
      console.log(`[PDFParserAgent] Completed in ${processingTime}ms (${Math.round(processingTime / numPages)}ms per page)`);

      return {
        success: true,
        metadata,
        pages,
        fullText,
        tables: allTables,
        chunks,
        processingTime
      };

    } catch (error) {
      console.error('[PDFParserAgent] Parse error:', error);
      return {
        success: false,
        metadata: {
          pages: 0,
          fileSize: buffer.length
        },
        pages: [],
        fullText: '',
        tables: [],
        chunks: [],
        processingTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown parsing error'
      };
    }
  }

  /**
   * Process a single page asynchronously
   */
  private async processPage(
    pdfDocument: any,
    pageNumber: number,
    config: ParseOptions
  ): Promise<ParsedPage> {
    try {
      const page = await pdfDocument.getPage(pageNumber);
      
      // Optimized text content extraction options
      const textContent = await page.getTextContent({
        normalizeWhitespace: false,      // Keep original spacing for accuracy
        disableCombineTextItems: false,  // Allow combining for speed
        includeMarkedContent: false      // Skip marked content parsing
      });
      
      let pageText = textContent.items
        ?.map((item: any) => (typeof item?.str === 'string' ? item.str : ''))
        .join(' ')
        .trim() ?? '';
      
      // OCR fallback only when page text is empty and canvas is available
      if (!pageText && config.performOCR && ENABLE_PDF_OCR && this.ocrProcessor) {
        try {
          if (!isCanvasAvailable()) {
            console.debug(`[PDFParserAgent] OCR requested for page ${pageNumber} but canvas disabled`);
          } else {
            const canvas = await safeLoadCanvas();
            if (canvas) {
              await this.ocrProcessor.initialize();
              // OCR processing would go here when fully implemented
              console.debug(`[PDFParserAgent] Canvas available for OCR on page ${pageNumber}`);
            }
          }
        } catch (ocrError) {
          console.warn(`OCR failed for page ${pageNumber}:`, ocrError);
        }
      }
      
      return {
        pageNumber,
        text: pageText,
        structuredText: [],
        tables: [],
        isImageBased: !pageText,
        ocrText: undefined
      };
    } catch (error) {
      console.error(`[PDFParserAgent] Error processing page ${pageNumber}:`, error);
      return {
        pageNumber,
        text: '',
        structuredText: [],
        tables: [],
        isImageBased: true,
        ocrText: undefined
      };
    }
  }

  private async extractPDFItems(buffer: Buffer): Promise<{ items: PdfReaderItem[], metadata: PDFMetadata }> {
    return new Promise((resolve, reject) => {
      const reader = new PdfReader();
      const items: PdfReaderItem[] = [];
      const metadata: PDFMetadata = {
        pages: 0,
        fileSize: buffer.length
      };

      reader.parseBuffer(buffer, (err, item) => {
        if (err) {
          reject(err);
          return;
        }

        if (!item) {
          // End of parsing
          resolve({ items, metadata });
          return;
        }

        // Extract metadata from file object
        if (item.file && item.file.pages) {
          (metadata as any).pages = item.file.pages;
        }

        // Collect all items with content
        if (item.text || item.x !== undefined) {
          items.push(item);
        }
      });
    });
  }

  private groupItemsByPage(items: PdfReaderItem[]): Map<number, PdfReaderItem[]> {
    const pageGroups = new Map<number, PdfReaderItem[]>();
    
    for (const item of items) {
      const pageNum = item.page || 1;
      if (!pageGroups.has(pageNum)) {
        pageGroups.set(pageNum, []);
      }
      const pageItems = pageGroups.get(pageNum);
      if (pageItems) {
        pageItems.push(item);
      }
    }

    return pageGroups;
  }

  private async processPageUnified(
    pdfDocument: any,
    pageNumber: number,
    config: ParseOptions
  ): Promise<ParsedPage> {
    try {
      const { extractPageText } = await import('@/lib/pdf/extractPageText');
      const page = await pdfDocument.getPage(pageNumber);
      
      // Use unified extraction (falls back to tesseract for images)
      const text = await extractPageText(page, {
        textThreshold: 50,
        pageNumber
      });
      
      return {
        pageNumber,
        text,
        structuredText: [],
        tables: [],
        isImageBased: !text,
        ocrText: undefined
      };
    } catch (error) {
      console.error(`Error processing page ${pageNumber}:`, error);
      return {
        pageNumber,
        text: '',
        structuredText: [],
        tables: [],
        isImageBased: true,
        ocrText: undefined
      };
    }
  }

  private async processPageWithItems(
    pageItems: PdfReaderItem[],
    pageNumber: number,
    config: ParseOptions
  ): Promise<ParsedPage> {
    const sortedItems = this.sortItems(pageItems);
    const text = sortedItems
      .filter(item => item.text)
      .map(item => item.text)
      .join(' ')
      .trim();

    const tables = config.extractTables ? 
      this.extractTablesFromItems(sortedItems, pageNumber) : [];

    const structuredText = config.preserveFormatting ?
      this.extractStructuredText(sortedItems) : [];

    return {
      pageNumber,
      text,
      structuredText,
      tables,
      isImageBased: !text && pageItems.length > 0,
      ocrText: undefined
    };
  }

  private sortItems(items: PdfReaderItem[]): PdfReaderItem[] {
    return [...items].sort((a, b) => {
      const yDiff = (a.y || 0) - (b.y || 0);
      if (Math.abs(yDiff) > 1) return yDiff;
      return (a.x || 0) - (b.x || 0);
    });
  }

  private extractStructuredText(items: PdfReaderItem[]): ParsedText[] {
    const structured: ParsedText[] = [];
    
    // Convert items to ParsedText format
    return items
      .filter(item => item.text) // Only include items with text
      .map(item => ({
        text: item.text || '',
        x: item.x || 0,
        y: item.y || 0,
        width: (item as any).width || 0,
        height: (item as any).height || 0,
        page: item.page || 1
      }));
  }

  private isHeading(item: PdfReaderItem): boolean {
    // @ts-expect-error - PdfReaderItem type is not fully typed
    const fontSize = item.height || 0;
    const text = item.text || '';
    
    return (
      fontSize > 14 ||
      /^[A-Z\s]{3,}$/.test(text) ||
      /^(SECTION|ARTICLE|CHAPTER|APPENDIX)\s+/i.test(text)
    );
  }

  private isBulletPoint(text: string): boolean {
    return /^[•◦▪▫◘○●□■\-\*]\s+/.test(text);
  }

  private extractTablesFromItems(items: PdfReaderItem[], pageNumber: number): ParsedTable[] {
    const tables: ParsedTable[] = [];
    const analyzer = new PDFAnalyzer();
    
    // Group items by vertical position (rows)
    const rows = this.groupItemsIntoRows(items);
    
    // Detect table-like structures
    const tableRegions = (analyzer as any).detectTableRegions ? (analyzer as any).detectTableRegions(rows) : [];
    
    for (const region of tableRegions) {
      const table = this.parseTableRegion(region, pageNumber);
      if (table && table.rows.length > 0) {
        tables.push(table);
      }
    }
    
    return tables;
  }

  private groupItemsIntoRows(items: PdfReaderItem[]): Map<number, PdfReaderItem[]> {
    const rows = new Map<number, PdfReaderItem[]>();
    const threshold = 2; // Y-position threshold for same row
    
    for (const item of items) {
      const y = Math.round(item.y || 0);
      let foundRow = false;
      
      // Check if this item belongs to an existing row
      for (const [rowY, rowItems] of rows) {
        if (Math.abs(rowY - y) <= threshold) {
          rowItems.push(item);
          foundRow = true;
          break;
        }
      }
      
      if (!foundRow) {
        rows.set(y, [item]);
      }
    }
    
    return rows;
  }

  private parseTableRegion(region: any, pageNumber: number): ParsedTable | null {
    try {
      const headers = region.headers || [];
      const rows = region.rows || [];
      
      return {
        page: pageNumber,
        headers,
        rows,
        x: (region as any).x || 0,
        y: (region as any).y || 0,
        width: (region as any).width || 0,
        height: (region as any).height || 0
      };
    } catch (error) {
      console.warn('Failed to parse table region:', error);
      return null;
    }
  }

  // renderPageToImage method removed - text-only processing mode

  chunkText(text: string, chunkSize: number, pages: ParsedPage[] = []): TextChunk[] {
    // Use the enhanced text processor for semantic chunking
    const semanticChunks = TextProcessor.createSemanticChunks(text, chunkSize);
    
    return semanticChunks.map((chunk, index) => {
      const actualPage = this.calculatePageFromPosition(chunk.text, pages);
      
      return {
        id: uuidv4(),
        text: chunk.text,
        content: chunk.text, // Add content field for compatibility
        page: actualPage,
        page_number: actualPage, // Add page_number for compatibility
        chunk_index: index,
        type: chunk.type || 'text',
        startY: (chunk as any).metadata?.startY,
        endY: (chunk as any).metadata?.endY,
        tokens: chunk.tokens || Math.ceil(chunk.text.length / 4)
      };
    });
  }

  private calculatePageFromPosition(text: string, pages: ParsedPage[]): number {
    if (pages.length === 0) return 1;
    
    // Find which page this text belongs to
    for (const page of pages) {
      if (page.text && text.includes(page.text.substring(0, 100))) {
        return page.pageNumber;
      }
    }
    
    return 1; // Default to first page if not found
  }

  /**
   * Public interface method for extracting tables from parsed text items
   */
  extractTables(items: ParsedText[]): ParsedTable[] {
    // Convert ParsedText to PdfReaderItem format for internal method
    const pdfReaderItems = items.map(item => ({
      text: item.text,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      page: item.page
    }));
    
    return this.extractTablesFromItems(pdfReaderItems, items[0]?.page || 1);
  }

  /**
   * Public interface method for performing OCR on a buffer
   */
  async performOCR(buffer: Buffer, pageNumber: number): Promise<string> {
    if (!this.ocrProcessor) {
      throw new Error('OCR processor not initialized');
    }

    try {
      const result = await this.ocrProcessor.processImage(buffer);
      return result.text;
    } catch (error) {
      console.error(`OCR failed for page ${pageNumber}:`, error);
      return '';
    }
  }

  async cleanup(): Promise<void> {
    if (this.ocrProcessor) {
      await this.ocrProcessor.cleanup();
    }
  }
}