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
    
    console.log('[OM-AI] PDFParserAgent.parseBuffer called, buffer size:', buffer.length);
    
    try {
      // Convert to plain Uint8Array for pdfjs-dist
      const data = toPlainUint8Array(buffer);
      
      // Debug logging
      console.log('[OM-AI] Converted to Uint8Array, size:', data.length, 
        'is Uint8Array:', data instanceof Uint8Array,
        'Buffer.isBuffer(data):', typeof Buffer !== 'undefined' && Buffer.isBuffer ? Buffer.isBuffer(data) : false);
      
      // Load PDF with pdfjs-dist using dynamic import
      let pdfjsLib: any;
      try {
        pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js');
        // Set full module path for worker
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.js';
        console.log('[OM-AI] Loaded pdfjs-dist legacy build (worker configured)');
      } catch {
        // @ts-expect-error - pdfjs legacy build types don't match runtime default export
        const mod = await import('pdfjs-dist/build/pdf.js');
        pdfjsLib = (mod as any).default ?? mod;
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/build/pdf.worker.js';
        console.log('[OM-AI] Loaded pdfjs-dist standard build (worker configured)');
      }
      
      const loadingTask = pdfjsLib.getDocument({ data });
      const pdfDocument = await loadingTask.promise;
      console.log('[OM-AI] pdf pages:', pdfDocument.numPages);
      
      // Extract basic PDF structure for metadata
      const { items, metadata } = await this.extractPDFItems(buffer);
      metadata.pages = pdfDocument.numPages;
      
      // Process ALL pages
      const pages: ParsedPage[] = [];
      let hasAnyText = false;
      
      try {
        for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
          const page = await pdfDocument.getPage(pageNumber);
          const textContent = await page.getTextContent();
          
          let pageText = textContent.items
            ?.map((item: any) => (typeof item?.str === 'string' ? item.str : ''))
            .join(' ')
            .trim() ?? '';
          
          // OCR fallback only when page text is empty and canvas is available
          if (!pageText && config.performOCR && ENABLE_PDF_OCR && this.ocrProcessor) {
            try {
              // Check if canvas is available before attempting OCR
              if (!isCanvasAvailable()) {
                console.warn(`[PDFParserAgent] OCR requested for page ${pageNumber} but canvas disabled (USE_CANVAS=false)`);
              } else {
                const canvas = await safeLoadCanvas();
                if (!canvas) {
                  console.warn(`[PDFParserAgent] OCR requested for page ${pageNumber} but no canvas package available`);
                } else {
                  await this.ocrProcessor.initialize();
                  // OCR processing would go here when fully implemented
                  console.debug(`[PDFParserAgent] Canvas available for OCR on page ${pageNumber}`);
                }
              }
            } catch (ocrError) {
              console.warn(`OCR failed for page ${pageNumber}:`, ocrError);
            }
          }
          
          if (pageText) hasAnyText = true;
          
          pages.push({
            pageNumber,
            text: pageText,
            structuredText: [],
            tables: [],
            isImageBased: !pageText,
            ocrText: undefined
          });
        }
      } finally {
        // Cleanup
        await pdfDocument.destroy();
      }
      
      // Check if we got any text at all
      if (!hasAnyText) {
        const err = new Error('No extractable text in PDF (image-only).');
        // @ts-expect-error - intentional runtime mismatch; see pdfjs import note
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
      const chunks = this.chunkText(fullText, 800, pages); // Use 800 tokens for better granularity instead of config.chunkSize

      if (chunks.length === 0) {
        const err = new Error('Document processing produced no chunks.');
        // @ts-expect-error - intentional runtime mismatch; see pdfjs import note
        err.code = 'NO_CHUNKS';
        throw err;
      }

      const processingTime = Date.now() - startTime;

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
      console.error('[OM-AI] PDFParserAgent.parseBuffer error:', error);
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
      const page = await pdfDocument.getPage(pageNumber);
      
      // Always use unified extractor
      const { extractPageText } = await import('@/lib/pdf/extractPageText');
      const pageText = await extractPageText(page);
      
      // For structured text and table extraction, we'll use a simple approach
      const structuredText: ParsedText[] = [];
      const tables: ParsedTable[] = [];
      
      return {
        pageNumber,
        text: pageText,
        structuredText,
        tables,
        isImageBased: false,
        ocrText: undefined
      };
    } catch (error) {
      console.warn(`Failed to extract page ${pageNumber}:`, error);
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
  
  // Keep original processPage for backward compatibility
  private async processPage(
    pageNumber: number, 
    items: PdfReaderItem[], 
    buffer: Buffer, 
    config: ParseOptions
  ): Promise<ParsedPage> {
    // Convert items to structured text
    const structuredText = this.convertToStructuredText(items, pageNumber);
    
    // Extract plain text
    const text = structuredText
      .map(item => item.text)
      .join(config.preserveFormatting ? ' ' : '\n');

    // Extract tables from structured text
    const tables = config.extractTables ? this.extractTables(structuredText) : [];

    // Determine if page is image-based (low text density)
    const isImageBased = this.isImageBasedPage(structuredText);

    // Perform OCR if needed
    let ocrText: string | undefined;
    if (config.performOCR && isImageBased) {
      try {
        ocrText = await this.performOCR(buffer, pageNumber);
      } catch (error) {
        console.warn(`OCR failed for page ${pageNumber}:`, error);
      }
    }

    return {
      pageNumber,
      text: ocrText || text,
      structuredText,
      tables,
      isImageBased,
      ocrText
    };
  }

  private convertToStructuredText(items: PdfReaderItem[], pageNumber: number): ParsedText[] {
    return items
      .filter(item => item.text && item.x !== undefined && item.y !== undefined)
      .map(item => ({
        text: item.text as string,
        x: item.x as number,
        y: item.y as number,
        width: item.w || 0,
        height: item.h || 0,
        page: pageNumber
      }))
      .sort((a, b) => {
        // Sort by Y position (top to bottom), then X position (left to right)
        if (Math.abs(a.y - b.y) < 2) { // Same line tolerance
          return a.x - b.x;
        }
        return a.y - b.y;
      });
  }


  private groupItemsByRows(items: ParsedText[]): ParsedText[][] {
    const rows: ParsedText[][] = [];
    let currentRow: ParsedText[] = [];
    let lastY = -1;
    const rowTolerance = 3; // Pixels tolerance for same row

    for (const item of items) {
      if (lastY === -1 || Math.abs(item.y - lastY) <= rowTolerance) {
        // Same row
        currentRow.push(item);
      } else {
        // New row
        if (currentRow.length > 0) {
          rows.push([...currentRow]);
        }
        currentRow = [item];
      }
      lastY = item.y;
    }

    // Add final row
    if (currentRow.length > 0) {
      rows.push(currentRow);
    }

    return rows;
  }

  private identifyTableGroups(rows: ParsedText[][]): ParsedText[][][] {
    const tableGroups: ParsedText[][][] = [];
    let currentTable: ParsedText[][] = [];
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      // Check if this row could be part of a table (multiple aligned items)
      if (row.length >= 2 && this.isTableRow(row)) {
        currentTable.push(row);
      } else {
        // End current table if it has enough rows
        if (currentTable.length >= 2) {
          tableGroups.push([...currentTable]);
        }
        currentTable = [];
      }
    }

    // Add final table
    if (currentTable.length >= 2) {
      tableGroups.push(currentTable);
    }

    return tableGroups;
  }

  private isTableRow(row: ParsedText[]): boolean {
    if (row.length < 2) return false;
    
    // Check for consistent spacing between columns
    const gaps: number[] = [];
    for (let i = 1; i < row.length; i++) {
      gaps.push(row[i].x - (row[i-1].x + row[i-1].width));
    }
    
    // Tables should have relatively consistent column gaps
    const avgGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    const variance = gaps.reduce((sum, gap) => sum + Math.pow(gap - avgGap, 2), 0) / gaps.length;
    
    return variance < 100; // Low variance indicates aligned columns
  }

  private buildTableFromGroup(group: ParsedText[][]): ParsedTable | null {
    if (group.length < 2) return null;

    const firstRow = group[0];
    const page = firstRow[0]?.page || 1;
    
    // Calculate table bounds
    const allItems = group.flat();
    const minX = Math.min(...allItems.map(item => item.x));
    const maxX = Math.max(...allItems.map(item => item.x + item.width));
    const minY = Math.min(...allItems.map(item => item.y));
    const maxY = Math.max(...allItems.map(item => item.y + item.height));

    // Extract table data
    const rows: string[][] = group.map(row => 
      row.map(item => item.text.trim()).filter(text => text.length > 0)
    );

    // First row might be headers
    const headers = rows[0];
    const dataRows = rows.slice(1);

    return {
      page,
      rows: dataRows,
      headers,
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  private isImageBasedPage(items: ParsedText[]): boolean {
    // Use PDF analyzer to detect if page appears to be image-based
    const totalText = items.reduce((sum, item) => sum + item.text.length, 0);
    const avgWordsPerItem = items.length > 0 ? totalText / items.length : 0;
    
    // Consider image-based if very low text density or fragmented text
    return totalText < 50 || (avgWordsPerItem < 3 && items.length > 10);
  }

  async performOCR(buffer: Buffer, pageNumber: number): Promise<string> {
    if (!this.ocrProcessor) {
      throw new Error('OCR processor not initialized');
    }

    try {
      // Try to use pdfjs-dist for better page extraction if available
      let pdfjsLib: any;
      try {
        pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js');
      } catch {
        // @ts-expect-error - pdfjs legacy build types don't match runtime default export
        const mod = await import('pdfjs-dist/build/pdf.js');
        pdfjsLib = (mod as any).default ?? mod;
      }
      
      // Set full module path for worker
      if (pdfjsLib.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsLib === (await import('pdfjs-dist/legacy/build/pdf.js')).default 
          ? 'pdfjs-dist/legacy/build/pdf.worker.js'
          : 'pdfjs-dist/build/pdf.worker.js';
      }
      
      try {
        const { extractPageText } = await import('@/lib/pdf/extractPageText');
        
        // Convert Buffer to Uint8Array for pdfjs-dist
        const data = toPlainUint8Array(buffer);
        
        // Load the PDF document
        const loadingTask = pdfjsLib.getDocument({ data });
        const pdfDocument = await loadingTask.promise;
        
        // Get the specific page
        const page = await pdfDocument.getPage(pageNumber);
        
        // Extract with OCR fallback
        const text = await extractPageText(page, {
          pageNumber
        });
        
        // Cleanup
        await pdfDocument.destroy();
        
        return TextProcessor.cleanText(text);
      } catch (pdfjsError) {
        // Don't try buffer-level OCR, just throw - page-level OCR is correct
        throw pdfjsError;
      }
    } catch (error) {
      console.error(`[OM-AI] OCR failed for page ${pageNumber}:`, error);
      throw error;
    }
  }
  
  /**
   * Text-only PDF processing - image rendering removed for simplified deployment
   */
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
        page_number: actualPage, // Add page_number field for database compatibility
        chunk_index: index,
        startY: 0,
        endY: 0,
        tokens: chunk.tokens,
        type: chunk.type
      };
    });
  }

  /**
   * Calculate the page number for a chunk based on text matching
   */
  private calculatePageFromPosition(text: string, pages: ParsedPage[] = []): number {
    // If no pages provided, default to 1
    if (!pages || pages.length === 0) {
      return 1;
    }

    // Try to match the chunk text with page content
    // Use first 80 characters for matching to avoid partial matches
    const searchText = text.slice(0, 80).trim();
    
    for (const page of pages) {
      // Check if this page's text contains the chunk's beginning
      if (page.text && page.text.includes(searchText)) {
        return page.pageNumber || 1;
      }
    }
    
    // If no match found, try a more lenient search with first 40 chars
    const shortSearchText = text.slice(0, 40).trim();
    for (const page of pages) {
      if (page.text && page.text.includes(shortSearchText)) {
        return page.pageNumber || 1;
      }
    }
    
    // Default to first page's number or 1
    return pages[0]?.pageNumber || 1;
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (this.ocrProcessor) {
      await this.ocrProcessor.terminate();
      this.ocrProcessor = null;
    }
  }

  /**
   * Enhanced table extraction using PDF analyzer
   */
  extractTables(items: ParsedText[]): ParsedTable[] {
    // Check if items form table structure
    if (!PDFAnalyzer.detectTableStructure(items)) {
      return [];
    }

    return this.extractTablesFromStructure(items);
  }

  private extractTablesFromStructure(items: ParsedText[]): ParsedTable[] {
    const tables: ParsedTable[] = [];
    
    // Group items by similar Y coordinates (table rows)
    const rows = this.groupItemsByRows(items);
    
    // Find potential table structures
    const tableGroups = this.identifyTableGroups(rows);
    
    for (const group of tableGroups) {
      const table = this.buildTableFromGroup(group);
      if (table && table.rows.length > 1) { // Must have at least header + 1 data row
        tables.push(table);
      }
    }
    
    return tables;
  }
}