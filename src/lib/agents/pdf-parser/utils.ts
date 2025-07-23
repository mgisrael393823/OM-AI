import { createWorker, Worker, PSM } from 'tesseract.js';

/**
 * OCR utilities for PDF parsing
 */
export class OCRProcessor {
  private worker: Worker | null = null;
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    this.worker = await createWorker('eng', 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
        }
      }
    });
    
    // Configure for better commercial document recognition
    await this.worker.setParameters({
      tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,;:!?()[]{}/"\'@#$%^&*-+=_|\\~`<> \t\n',
      tessedit_pageseg_mode: PSM.AUTO_OSD, // Automatic page segmentation with OSD
      preserve_interword_spaces: '1'
    });
    
    this.isInitialized = true;
  }

  async processImage(imageBuffer: Buffer, confidenceThreshold = 70): Promise<{
    text: string;
    confidence: number;
  }> {
    if (!this.worker) {
      await this.initialize();
    }

    const { data } = await this.worker!.recognize(imageBuffer, {
      rectangle: undefined // Process entire image
    });

    return {
      text: data.text,
      confidence: data.confidence
    };
  }

  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
    }
  }
}

/**
 * Utility functions for PDF structure analysis
 */
export class PDFAnalyzer {
  
  /**
   * Detect if text appears to be in table format based on positioning
   */
  static detectTableStructure(textItems: Array<{
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>): boolean {
    if (textItems.length < 4) return false;

    // Group by similar Y coordinates (rows)
    const rows = this.groupByRows(textItems, 3);
    
    if (rows.length < 2) return false;

    // Check if multiple rows have similar column structure
    const columnCounts = rows.map(row => row.length);
    const avgColumns = columnCounts.reduce((a, b) => a + b, 0) / columnCounts.length;
    
    // Table-like if most rows have 2+ items and similar column counts
    return avgColumns >= 2 && this.hasConsistentColumns(rows);
  }

  /**
   * Extract financial numbers from text
   */
  static extractFinancialData(text: string): Array<{
    value: number;
    formatted: string;
    type: 'currency' | 'percentage' | 'number';
    context: string;
  }> {
    const financialPatterns = [
      // Currency patterns
      {
        regex: /\$[\d,]+(?:\.\d{2})?/g,
        type: 'currency' as const
      },
      // Percentage patterns
      {
        regex: /\d+(?:\.\d+)?%/g,
        type: 'percentage' as const
      },
      // Large numbers (likely financial)
      {
        regex: /\b\d{1,3}(?:,\d{3})+(?:\.\d{2})?\b/g,
        type: 'number' as const
      }
    ];

    const results: Array<{
      value: number;
      formatted: string;
      type: 'currency' | 'percentage' | 'number';
      context: string;
    }> = [];

    for (const pattern of financialPatterns) {
      const matches = text.match(pattern.regex);
      if (matches) {
        for (const match of matches) {
          // Extract context (surrounding words)
          const index = text.indexOf(match);
          const contextStart = Math.max(0, index - 50);
          const contextEnd = Math.min(text.length, index + match.length + 50);
          const context = text.substring(contextStart, contextEnd).trim();

          // Parse numeric value
          let value = 0;
          if (pattern.type === 'currency') {
            value = parseFloat(match.replace(/[\$,]/g, ''));
          } else if (pattern.type === 'percentage') {
            value = parseFloat(match.replace('%', ''));
          } else {
            value = parseFloat(match.replace(/,/g, ''));
          }

          if (!isNaN(value)) {
            results.push({
              value,
              formatted: match,
              type: pattern.type,
              context
            });
          }
        }
      }
    }

    return results;
  }

  /**
   * Identify key real estate terms and metrics
   */
  static extractRealEstateMetrics(text: string): {
    propertyType?: string;
    squareFootage?: number;
    rentPSF?: number;
    capRate?: number;
    noi?: number;
    keyTerms: string[];
  } {
    const lowerText = text.toLowerCase();
    
    // Property type detection
    const propertyTypes = ['office', 'retail', 'industrial', 'multifamily', 'warehouse', 'medical'];
    const propertyType = propertyTypes.find(type => lowerText.includes(type));

    // Square footage
    const sfMatches = text.match(/(\d{1,3}(?:,\d{3})*)\s*(?:sq\.?\s*ft\.?|square\s+feet|sf)/i);
    const squareFootage = sfMatches ? parseInt(sfMatches[1].replace(/,/g, '')) : undefined;

    // Rent per square foot
    const rentMatches = text.match(/\$(\d+(?:\.\d{2})?)\s*(?:per|\/)\s*(?:sq\.?\s*ft\.?|sf)/i);
    const rentPSF = rentMatches ? parseFloat(rentMatches[1]) : undefined;

    // Cap rate
    const capMatches = text.match(/(\d+(?:\.\d+)?)%?\s*cap\s*rate/i);
    const capRate = capMatches ? parseFloat(capMatches[1]) : undefined;

    // NOI (Net Operating Income)
    const noiMatches = text.match(/noi[\s:$]*(\d{1,3}(?:,\d{3})*)/i);
    const noi = noiMatches ? parseInt(noiMatches[1].replace(/,/g, '')) : undefined;

    // Key terms present
    const keyTerms = [
      'lease', 'rent', 'tenant', 'landlord', 'square feet', 'cap rate', 
      'noi', 'cash flow', 'operating expenses', 'vacancy', 'market rate',
      'triple net', 'gross lease', 'cam charges', 'escalation'
    ].filter(term => lowerText.includes(term));

    return {
      propertyType,
      squareFootage,
      rentPSF,
      capRate,
      noi,
      keyTerms
    };
  }

  private static groupByRows(
    items: Array<{ x: number; y: number; width: number; height: number; text: string }>, 
    tolerance = 3
  ): Array<Array<{ x: number; y: number; width: number; height: number; text: string }>> {
    const sorted = [...items].sort((a, b) => a.y - b.y);
    const rows: Array<Array<typeof items[0]>> = [];
    let currentRow: Array<typeof items[0]> = [];
    let lastY = -1;

    for (const item of sorted) {
      if (lastY === -1 || Math.abs(item.y - lastY) <= tolerance) {
        currentRow.push(item);
      } else {
        if (currentRow.length > 0) {
          rows.push([...currentRow.sort((a, b) => a.x - b.x)]);
        }
        currentRow = [item];
      }
      lastY = item.y;
    }

    if (currentRow.length > 0) {
      rows.push(currentRow.sort((a, b) => a.x - b.x));
    }

    return rows;
  }

  private static hasConsistentColumns(rows: Array<Array<any>>): boolean {
    if (rows.length < 2) return false;

    const columnCounts = rows.map(row => row.length);
    const maxCount = Math.max(...columnCounts);
    const minCount = Math.min(...columnCounts);
    
    // Allow some variation but require general consistency
    return (maxCount - minCount) <= 2 && minCount >= 2;
  }
}

/**
 * Text processing utilities
 */
export class TextProcessor {
  
  /**
   * Clean and normalize extracted text
   */
  static cleanText(text: string): string {
    return text
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Remove control characters
      .replace(/[\x00-\x1F\x7F]/g, '')
      // Normalize quotes
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      // Clean up spacing around punctuation
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/([,.;:!?])\s+/g, '$1 ')
      .trim();
  }

  /**
   * Split text into semantic chunks for better processing
   */
  static createSemanticChunks(text: string, maxChunkSize = 1000): Array<{
    text: string;
    type: 'paragraph' | 'list' | 'table' | 'header';
    tokens: number;
  }> {
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const chunks: Array<{ text: string; type: 'paragraph' | 'list' | 'table' | 'header'; tokens: number }> = [];

    let currentChunk = '';
    let currentTokens = 0;

    for (const paragraph of paragraphs) {
      const paraTokens = Math.ceil(paragraph.length / 4); // Rough token estimate

      if (currentTokens + paraTokens > maxChunkSize && currentChunk.length > 0) {
        chunks.push({
          text: this.cleanText(currentChunk),
          type: 'paragraph',
          tokens: currentTokens
        });
        currentChunk = paragraph;
        currentTokens = paraTokens;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
        currentTokens += paraTokens;
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push({
        text: this.cleanText(currentChunk),
        type: 'paragraph',
        tokens: currentTokens
      });
    }

    return chunks;
  }

  private static detectParagraphType(text: string): 'paragraph' | 'list' | 'table' | 'header' {
    const trimmed = text.trim();
    
    // Header detection (short, all caps, or title case)
    if (trimmed.length < 100 && (
      trimmed === trimmed.toUpperCase() || 
      /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*$/.test(trimmed)
    )) {
      return 'header';
    }

    // List detection
    if (/^[\s]*[-•*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      return 'list';
    }

    // Table detection (multiple tab characters or aligned spacing)
    if (trimmed.includes('\t\t') || /\s{4,}/.test(trimmed)) {
      return 'table';
    }

    return 'paragraph';
  }
}