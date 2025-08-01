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

export class PDFParserAgent implements IPDFParserAgent {
  private ocrProcessor: OCRProcessor | null = null;
  private defaultOptions: ParseOptions = {
    extractTables: true,
    performOCR: false,
    ocrConfidenceThreshold: 70,
    chunkSize: 1000,
    preserveFormatting: true
  };

  constructor() {
    this.ocrProcessor = new OCRProcessor();
  }

  async parseBuffer(buffer: Buffer, options?: Partial<ParseOptions>): Promise<ParseResult> {
    const startTime = Date.now();
    const config = { ...this.defaultOptions, ...options };
    
    try {
      // Extract basic PDF structure
      const { items, metadata } = await this.extractPDFItems(buffer);
      
      // Group items by page
      const pageGroups = this.groupItemsByPage(items);
      
      // Process each page
      const pages: ParsedPage[] = [];
      for (const [pageNum, pageItems] of pageGroups.entries()) {
        const page = await this.processPage(pageNum + 1, pageItems, buffer, config);
        pages.push(page);
      }

      // Extract all tables across pages
      const allTables: ParsedTable[] = [];
      const allText: string[] = [];
      
      for (const page of pages) {
        allTables.push(...page.tables);
        allText.push(page.text);
      }

      // Create text chunks for embedding/search
      const fullText = allText.join('\n\n');
      const chunks = this.chunkText(fullText, config.chunkSize);

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
      await this.ocrProcessor.initialize();
      
      // Note: In a complete implementation, you would convert the specific PDF page
      // to an image using a library like pdf2pic. For now, we'll process the entire buffer.
      const result = await this.ocrProcessor.processImage(buffer, this.defaultOptions.ocrConfidenceThreshold);
      
      return TextProcessor.cleanText(result.text);
    } catch (error) {
      console.error(`OCR failed for page ${pageNumber}:`, error);
      throw error;
    }
  }

  chunkText(text: string, chunkSize: number): TextChunk[] {
    // Use the enhanced text processor for semantic chunking
    const semanticChunks = TextProcessor.createSemanticChunks(text, chunkSize);
    
    return semanticChunks.map(chunk => ({
      id: uuidv4(),
      text: chunk.text,
      page: 1, // TODO: Track actual page numbers from parsing
      startY: 0,
      endY: 0,
      tokens: chunk.tokens,
      type: chunk.type
    }));
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