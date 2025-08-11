/**
 * Enhanced PDF Parser for CRE Document Analysis
 * 
 * Production-ready PDF parser optimized for commercial real estate documents
 * with fallback strategies, performance monitoring, and error resilience.
 */

import { performance } from 'perf_hooks';
import { v4 as uuidv4 } from 'uuid';

// Primary parser (pdfjs-dist based on evaluation) - lazy-loaded for better performance

// Fallback parser (existing pdfreader)
import { PDFParserAgent } from '@/lib/agents/pdf-parser/PDFParserAgent';
import { ParseOptions, ParseResult, TextChunk, PDFMetadata } from '@/lib/agents/pdf-parser/types';
import { extractPageText } from '@/lib/pdf/extractPageText';

// Configure PDF.js for Node.js environment
if (typeof globalThis === 'undefined') {
  (global as any).globalThis = global;
}

// Enhanced parsing options
export interface EnhancedParseOptions extends ParseOptions {
  useFallbackOnFailure: boolean;
  maxProcessingTimeMs: number;
  enablePerformanceMonitoring: boolean;
  structuredExtraction: boolean; // For CRE-specific data extraction
}

// Performance and reliability metrics
export interface ParsingMetrics {
  processingTimeMs: number;
  memoryUsageMB: number;
  parserUsed: 'pdfjs' | 'pdfreader' | 'hybrid';
  success: boolean;
  errorType?: string;
  textLength: number;
  tablesFound: number;
  pagesProcessed: number;
}

// CRE-specific content patterns
const CRE_PATTERNS = {
  financials: {
    capRate: /cap\s*rate.*?(\d+\.?\d*%)/gi,
    noi: /net\s*operating\s*income.*?(\$[\d,]+)/gi,
    rentRoll: /rent\s*roll|rental\s*income/gi,
    expenses: /operating\s*expenses.*?(\$[\d,]+)/gi
  },
  property: {
    address: /(?:address|location|property).*?(\d+[^,\n]*(?:street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd)[^,\n]*)/gi,
    squareFeet: /(\d{1,3}(?:,\d{3})*)\s*(?:sq\.?\s*ft\.?|square\s*feet)/gi,
    buildingType: /(?:building\s*type|property\s*type).*?(office|retail|industrial|multi-family|warehouse)/gi
  },
  lease: {
    leaseRate: /(?:lease\s*rate|rent).*?(\$\d+(?:\.\d{2})?)\s*(?:per|\/)\s*(?:sq\.?\s*ft\.?|psf)/gi,
    leaseTerm: /(?:lease\s*term|term).*?(\d+)\s*(?:years?|yrs?|months?)/gi,
    expiration: /(?:expiration|expires?).*?(\d{1,2}\/\d{1,2}\/\d{2,4})/gi
  }
};

export class EnhancedPDFParser {
  private fallbackParser: PDFParserAgent;
  private metrics: ParsingMetrics[] = [];
  
  constructor() {
    this.fallbackParser = new PDFParserAgent();
  }

  async parseBuffer(
    buffer: Buffer, 
    options: Partial<EnhancedParseOptions> = {}
  ): Promise<ParseResult & { metrics: ParsingMetrics }> {
    const config: EnhancedParseOptions = {
      extractTables: true,
      performOCR: false,
      ocrConfidenceThreshold: 70,
      chunkSize: 1000,
      preserveFormatting: true,
      useFallbackOnFailure: true,
      maxProcessingTimeMs: 30000, // 30 second timeout
      enablePerformanceMonitoring: true,
      structuredExtraction: true,
      ...options
    };

    const startTime = performance.now();
    const startMemory = process.memoryUsage().heapUsed;

    try {
      // Try primary parser (PDF.js) first
      const primaryResult = await this.parsePrimary(buffer, config);
      
      if (primaryResult.success && primaryResult.result) {
        const metrics = this.createMetrics(startTime, startMemory, 'pdfjs', true, primaryResult);
        return { ...primaryResult.result, metrics };
      }
      
      // Fall back to secondary parser if enabled
      if (config.useFallbackOnFailure) {
        console.warn('Primary parser failed, attempting fallback:', primaryResult.error);
        const fallbackResult = await this.parseFallback(buffer, config);
        const metrics = this.createMetrics(startTime, startMemory, 'pdfreader', true, fallbackResult);
        return { ...fallbackResult, metrics };
      }
      
      throw new Error(`Primary parser failed: ${primaryResult.error}`);
      
    } catch (error) {
      const metrics = this.createMetrics(startTime, startMemory, 'pdfjs', false, null, error);
      
      // Last resort: try fallback even if not explicitly enabled
      if (!config.useFallbackOnFailure) {
        try {
          const fallbackResult = await this.parseFallback(buffer, config);
          const hybridMetrics = this.createMetrics(startTime, startMemory, 'hybrid', true, fallbackResult);
          return { ...fallbackResult, metrics: hybridMetrics };
        } catch (fallbackError) {
          console.error('Both parsers failed:', { primary: error, fallback: fallbackError });
        }
      }
      
      throw error;
    }
  }

  private async parsePrimary(
    buffer: Buffer, 
    config: EnhancedParseOptions
  ): Promise<{ success: boolean; result?: ParseResult; error?: string }> {
    try {
      // Lazy-load pdfjs-dist for better performance
      const pdfjsLib = await import('pdfjs-dist');
      
      // Create PDF document from buffer
      const pdfDocument = await pdfjsLib.getDocument({
        data: buffer,
        standardFontDataUrl: undefined, // Disable font loading for server
        isEvalSupported: false
      }).promise;

      const numPages = pdfDocument.numPages;
      const pages: any[] = [];
      const allText: string[] = [];
      const allTables: any[] = [];

      // Process each page
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdfDocument.getPage(pageNum);
        
        // Use our enhanced extraction with OCR fallback
        const pageText = await extractPageText(page, {
          pageNumber: pageNum
        });
        
        if (pageText) {
          allText.push(pageText);
          
          // Basic table detection (enhanced logic would go here)
          const tableMatches = this.detectTables(pageText);
          allTables.push(...tableMatches);
          
          pages.push({
            pageNumber: pageNum,
            text: pageText,
            tables: tableMatches,
            chunks: this.createTextChunks(pageText, pageNum, config.chunkSize)
          });
        }
      }

      // Create metadata
      const metadata = await this.extractMetadata(pdfDocument);
      
      // Generate structured chunks
      const chunks = this.generateStructuredChunks(pages, config);
      
      // Extract CRE-specific data if enabled
      const structuredData = config.structuredExtraction 
        ? this.extractCREData(allText.join('\n'))
        : {};

      const result: ParseResult = {
        success: true,
        pages,
        chunks,
        metadata: {
          ...metadata,
          processingTime: Date.now(),
          pageCount: numPages,
          wordCount: allText.join(' ').split(/\s+/).length
        },
        fullText: allText.join('\n'),
        tables: allTables,
        processingTime: Date.now()
      };

      return result;
      
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown PDF.js error' 
      };
    }
  }

  private async parseFallback(buffer: Buffer, config: EnhancedParseOptions): Promise<ParseResult> {
    console.info('Using fallback PDF parser (pdfreader)');
    return await this.fallbackParser.parseBuffer(buffer, config);
  }

  private detectTables(text: string): any[] {
    // Enhanced table detection logic
    const tables: any[] = [];
    
    // Look for common CRE table patterns
    const tablePatterns = [
      /rent\s*roll/gi,
      /operating\s*expenses/gi,
      /cash\s*flow/gi,
      /lease\s*schedule/gi
    ];
    
    for (const pattern of tablePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        // Extract table content (simplified for now)
        tables.push({
          type: pattern.source,
          content: text.substring(
            text.search(pattern), 
            Math.min(text.length, text.search(pattern) + 500)
          )
        });
      }
    }
    
    return tables;
  }

  private createTextChunks(text: string, pageNumber: number, chunkSize: number): TextChunk[] {
    const chunks: TextChunk[] = [];
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    
    let currentChunk = '';
    let chunkIndex = 0;
    
    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
        chunks.push({
          id: uuidv4(),
          text: currentChunk.trim(),
          page_number: pageNumber,
          chunk_index: chunkIndex++,
          type: this.classifyChunkType(currentChunk),
          word_count: currentChunk.trim().split(/\s+/).length,
          char_count: currentChunk.length
        });
        currentChunk = sentence;
      } else {
        currentChunk += (currentChunk ? '. ' : '') + sentence;
      }
    }
    
    // Add final chunk
    if (currentChunk.trim()) {
      chunks.push({
        id: uuidv4(),
        content: currentChunk.trim(),  // Keep 'content' for DB compatibility
        page_number: pageNumber,
        chunk_index: chunkIndex,
        type: this.classifyChunkType(currentChunk),
        word_count: currentChunk.trim().split(/\s+/).length,
        char_count: currentChunk.length
      });
    }
    
    return chunks;
  }

  private classifyChunkType(text: string): 'paragraph' | 'table' | 'header' | 'footer' | 'list' {
    // Simple classification logic
    if (text.includes('$') && /\d+/.test(text)) return 'table';
    if (text.length < 50) return 'header';
    if (/^\d+\.|\-\s/.test(text.trim())) return 'list';
    return 'paragraph';
  }

  private async extractMetadata(pdfDocument: any): Promise<PDFMetadata> {
    try {
      const metadata = await pdfDocument.getMetadata();
      return {
        title: metadata.info?.Title || 'Untitled',
        author: metadata.info?.Author || 'Unknown',
        subject: metadata.info?.Subject || '',
        creator: metadata.info?.Creator || '',
        producer: metadata.info?.Producer || '',
        creationDate: metadata.info?.CreationDate ? new Date(metadata.info.CreationDate) : new Date(),
        modificationDate: metadata.info?.ModDate ? new Date(metadata.info.ModDate) : new Date(),
        pages: pdfDocument.numPages,
        fileSize: 0 // Will be set by the calling function if available
      };
    } catch (error) {
      console.warn('Failed to extract PDF metadata:', error);
      return {
        title: 'Untitled',
        author: 'Unknown',
        subject: '',
        creator: '',
        producer: '',
        creationDate: new Date(),
        modificationDate: new Date(),
        pages: 0,
        fileSize: 0
      };
    }
  }

  private generateStructuredChunks(pages: any[], config: EnhancedParseOptions): TextChunk[] {
    const allChunks: TextChunk[] = [];
    
    for (const page of pages) {
      allChunks.push(...page.chunks);
    }
    
    return allChunks;
  }

  private extractCREData(text: string): Record<string, any> {
    const extracted: Record<string, any> = {};
    
    // Extract financial metrics
    for (const [key, pattern] of Object.entries(CRE_PATTERNS.financials)) {
      const matches = text.match(pattern);
      if (matches) {
        extracted[key] = matches.map(match => match.trim());
      }
    }
    
    // Extract property information
    for (const [key, pattern] of Object.entries(CRE_PATTERNS.property)) {
      const matches = text.match(pattern);
      if (matches) {
        extracted[key] = matches.map(match => match.trim());
      }
    }
    
    // Extract lease information
    for (const [key, pattern] of Object.entries(CRE_PATTERNS.lease)) {
      const matches = text.match(pattern);
      if (matches) {
        extracted[key] = matches.map(match => match.trim());
      }
    }
    
    return extracted;
  }

  private createMetrics(
    startTime: number,
    startMemory: number,
    parser: 'pdfjs' | 'pdfreader' | 'hybrid',
    success: boolean,
    result: any,
    error?: any
  ): ParsingMetrics {
    const endTime = performance.now();
    const endMemory = process.memoryUsage().heapUsed;
    
    const metrics: ParsingMetrics = {
      processingTimeMs: endTime - startTime,
      memoryUsageMB: (endMemory - startMemory) / 1024 / 1024,
      parserUsed: parser,
      success,
      textLength: result?.rawText?.length || 0,
      tablesFound: result?.tables?.length || 0,
      pagesProcessed: result?.pages?.length || 0
    };
    
    if (!success && error) {
      metrics.errorType = error.name || error.constructor.name || 'Unknown';
    }
    
    // Store metrics for analysis
    this.metrics.push(metrics);
    
    return metrics;
  }

  // Get performance analytics
  getPerformanceMetrics(): {
    averageProcessingTime: number;
    successRate: number;
    preferredParser: string;
    memoryEfficiency: number;
  } {
    if (this.metrics.length === 0) {
      return {
        averageProcessingTime: 0,
        successRate: 0,
        preferredParser: 'unknown',
        memoryEfficiency: 0
      };
    }
    
    const successful = this.metrics.filter(m => m.success);
    const avgTime = successful.reduce((sum, m) => sum + m.processingTimeMs, 0) / successful.length;
    const successRate = (successful.length / this.metrics.length) * 100;
    
    // Determine preferred parser based on performance
    const parserStats = this.metrics.reduce((acc, m) => {
      if (!acc[m.parserUsed]) acc[m.parserUsed] = { count: 0, avgTime: 0, successRate: 0 };
      acc[m.parserUsed].count++;
      acc[m.parserUsed].avgTime += m.processingTimeMs;
      if (m.success) acc[m.parserUsed].successRate++;
      return acc;
    }, {} as Record<string, any>);
    
    let preferredParser = 'pdfjs';
    let bestScore = 0;
    
    for (const [parser, stats] of Object.entries(parserStats)) {
      const avgTime = stats.avgTime / stats.count;
      const successRate = (stats.successRate / stats.count) * 100;
      const score = successRate - (avgTime / 1000); // Simple scoring
      
      if (score > bestScore) {
        bestScore = score;
        preferredParser = parser;
      }
    }
    
    const avgMemory = successful.reduce((sum, m) => sum + m.memoryUsageMB, 0) / successful.length;
    
    return {
      averageProcessingTime: avgTime,
      successRate,
      preferredParser,
      memoryEfficiency: 100 - Math.min(100, avgMemory) // Inverse of memory usage
    };
  }
}

// Export singleton instance
export const enhancedPDFParser = new EnhancedPDFParser();