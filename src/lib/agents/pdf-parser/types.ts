export interface ParsedText {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

export interface ParsedTable {
  page: number;
  rows: string[][];
  headers?: string[];
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ParsedPage {
  pageNumber: number;
  text: string;
  structuredText: ParsedText[];
  tables: ParsedTable[];
  isImageBased: boolean;
  ocrText?: string;
}

export interface PDFMetadata {
  title?: string;
  author?: string;
  subject?: string;
  creator?: string;
  producer?: string;
  creationDate?: Date;
  modificationDate?: Date;
  pages: number;
  fileSize: number;
  /** Number of pages in the document */
  pageCount?: number;
  /** Total word count across all pages */
  wordCount?: number;
  /** How long the parsing took, in milliseconds */
  processingTime?: number;
}

export interface ParseOptions {
  extractTables: boolean;
  performOCR: boolean;
  ocrConfidenceThreshold: number;
  chunkSize: number;
  preserveFormatting: boolean;
}

export interface ParseResult {
  success: boolean;
  metadata: PDFMetadata;
  pages: ParsedPage[];
  fullText: string;
  tables: ParsedTable[];
  chunks: TextChunk[];
  processingTime: number;
  error?: string;
}

export interface TextChunk {
  id: string;
  /** Original parser text */
  text?: string;
  /** Enhanced parser content */
  content?: string;
  /** Legacy page number */
  page?: number;
  /** Enhanced parser page number */
  page_number?: number;
  /** Y‐coordinate at top of chunk */
  startY?: number;
  /** Y‐coordinate at bottom of chunk */
  endY?: number;
  /** Token count */
  tokens?: number;
  /** Enhanced parser chunk index */
  chunk_index?: number;
  /** Enhanced parser word count */
  word_count?: number;
  /** Enhanced parser character count */
  char_count?: number;
  type: 'paragraph' | 'table' | 'header' | 'footer' | 'list';
}

export interface IPDFParserAgent {
  parseBuffer(buffer: Buffer, options?: Partial<ParseOptions>): Promise<ParseResult>;
  extractTables(items: ParsedText[]): ParsedTable[];
  performOCR(buffer: Buffer, pageNumber: number): Promise<string>;
  chunkText(text: string, chunkSize: number, pages?: ParsedPage[]): TextChunk[];
}