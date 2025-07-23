/**
 * PDF Structure Validation
 * Enhanced validation beyond MIME type checking
 */

export interface PDFValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metadata: {
    version?: string;
    pageCount?: number;
    hasText: boolean;
    hasImages: boolean;
    isEncrypted: boolean;
    fileSize: number;
    estimatedComplexity: 'low' | 'medium' | 'high';
  };
}

export class PDFValidator {
  private static readonly PDF_MAGIC_BYTES = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
  private static readonly MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
  private static readonly MIN_FILE_SIZE = 100; // 100 bytes

  /**
   * Comprehensive PDF validation
   */
  static async validatePDF(buffer: Buffer, filename?: string): Promise<PDFValidationResult> {
    const result: PDFValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      metadata: {
        hasText: false,
        hasImages: false,
        isEncrypted: false,
        fileSize: buffer.length,
        estimatedComplexity: 'low'
      }
    };

    try {
      // Basic validation
      this.validateBasicStructure(buffer, result, filename);
      
      if (result.errors.length > 0) {
        result.isValid = false;
        return result;
      }

      // Advanced structure validation
      await this.validatePDFStructure(buffer, result);
      
      // Security validation
      this.validateSecurity(buffer, result);
      
      // Content analysis
      this.analyzeContent(buffer, result);

    } catch (error) {
      result.isValid = false;
      result.errors.push(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Basic file validation
   */
  private static validateBasicStructure(
    buffer: Buffer, 
    result: PDFValidationResult, 
    filename?: string
  ): void {
    // File size validation
    if (buffer.length < this.MIN_FILE_SIZE) {
      result.errors.push('File is too small to be a valid PDF');
      return;
    }

    if (buffer.length > this.MAX_FILE_SIZE) {
      result.errors.push(`File size exceeds maximum allowed size of ${this.MAX_FILE_SIZE / (1024 * 1024)}MB`);
      return;
    }

    // Extension validation
    if (filename && !filename.toLowerCase().endsWith('.pdf')) {
      result.warnings.push('File extension is not .pdf');
    }

    // Magic bytes validation
    if (!buffer.subarray(0, 4).equals(this.PDF_MAGIC_BYTES)) {
      result.errors.push('File does not start with PDF magic bytes (%PDF)');
      return;
    }

    // PDF version validation
    const versionMatch = buffer.subarray(0, 20).toString('ascii').match(/%PDF-(\d\.\d)/);
    if (versionMatch) {
      result.metadata.version = versionMatch[1];
      const version = parseFloat(versionMatch[1]);
      
      if (version < 1.0 || version > 2.0) {
        result.warnings.push(`Unusual PDF version: ${version}`);
      }
    } else {
      result.warnings.push('Could not determine PDF version');
    }
  }

  /**
   * Advanced PDF structure validation
   */
  private static async validatePDFStructure(
    buffer: Buffer, 
    result: PDFValidationResult
  ): Promise<void> {
    const bufferStr = buffer.toString('latin1');
    
    // Check for required PDF elements
    const requiredElements = [
      { name: 'trailer', pattern: /trailer\s*<</, required: true },
      { name: 'xref', pattern: /xref\s*\n/, required: true },
      { name: 'startxref', pattern: /startxref\s*\n?\d+/, required: true },
      { name: 'EOF marker', pattern: /%%EOF\s*$/, required: true }
    ];

    for (const element of requiredElements) {
      if (!element.pattern.test(bufferStr)) {
        if (element.required) {
          result.errors.push(`Missing required PDF element: ${element.name}`);
        } else {
          result.warnings.push(`Missing optional PDF element: ${element.name}`);
        }
      }
    }

    // Estimate page count
    const pageMatches = bufferStr.match(/\/Type\s*\/Page[^s]/g);
    if (pageMatches) {
      result.metadata.pageCount = pageMatches.length;
      
      if (result.metadata.pageCount === 0) {
        result.warnings.push('PDF appears to have no pages');
      } else if (result.metadata.pageCount > 1000) {
        result.warnings.push('PDF has an unusually high number of pages');
      }
    }

    // Check for corruption indicators
    this.checkForCorruption(bufferStr, result);
  }

  /**
   * Security validation
   */
  private static validateSecurity(buffer: Buffer, result: PDFValidationResult): void {
    const bufferStr = buffer.toString('latin1');

    // Check for encryption
    if (/\/Encrypt\s+\d+\s+\d+\s+R/.test(bufferStr)) {
      result.metadata.isEncrypted = true;
      result.warnings.push('PDF is encrypted - may require password for processing');
    }

    // Check for potentially malicious content
    const maliciousPatterns = [
      { pattern: /\/JavaScript\s*<</, warning: 'PDF contains JavaScript code' },
      { pattern: /\/OpenAction\s*<</, warning: 'PDF has automatic action triggers' },
      { pattern: /\/Launch\s*<</, warning: 'PDF can launch external applications' },
      { pattern: /\/URI\s*\([^)]*\)/, warning: 'PDF contains external URI links' },
      { pattern: /\/EmbeddedFile\s*<</, warning: 'PDF contains embedded files' }
    ];

    for (const { pattern, warning } of maliciousPatterns) {
      if (pattern.test(bufferStr)) {
        result.warnings.push(warning);
      }
    }
  }

  /**
   * Content analysis
   */
  private static analyzeContent(buffer: Buffer, result: PDFValidationResult): void {
    const bufferStr = buffer.toString('latin1');

    // Check for text content
    if (/\/Type\s*\/Font/.test(bufferStr) || /BT\s+.*?ET/s.test(bufferStr)) {
      result.metadata.hasText = true;
    }

    // Check for images
    if (/\/Type\s*\/XObject\s*\/Subtype\s*\/Image/.test(bufferStr) || 
        /\/Filter\s*\/DCTDecode/.test(bufferStr) ||
        /\/Filter\s*\/FlateDecode/.test(bufferStr)) {
      result.metadata.hasImages = true;
    }

    // Estimate complexity
    let complexityScore = 0;
    
    // Text complexity
    const textMatches = bufferStr.match(/BT\s+.*?ET/gs);
    if (textMatches) {
      complexityScore += Math.min(textMatches.length / 10, 3);
    }

    // Image complexity
    const imageMatches = bufferStr.match(/\/Type\s*\/XObject/g);
    if (imageMatches) {
      complexityScore += Math.min(imageMatches.length / 5, 4);
    }

    // Font complexity
    const fontMatches = bufferStr.match(/\/Type\s*\/Font/g);
    if (fontMatches) {
      complexityScore += Math.min(fontMatches.length / 3, 2);
    }

    // Form complexity
    if (/\/AcroForm/.test(bufferStr)) {
      complexityScore += 2;
    }

    // Determine complexity level
    if (complexityScore < 3) {
      result.metadata.estimatedComplexity = 'low';
    } else if (complexityScore < 7) {
      result.metadata.estimatedComplexity = 'medium';
    } else {
      result.metadata.estimatedComplexity = 'high';
    }

    // Add complexity-based warnings
    if (result.metadata.estimatedComplexity === 'high') {
      result.warnings.push('Complex PDF may require longer processing time');
    }
  }

  /**
   * Check for corruption indicators
   */
  private static checkForCorruption(bufferStr: string, result: PDFValidationResult): void {
    const corruptionIndicators = [
      { pattern: /obj\s*<<\s*>>/, warning: 'Empty object definitions found' },
      { pattern: /\/Length\s+0\s*>>/g, warning: 'Zero-length streams detected' },
      { pattern: /\/Type\s*\/Catalog.*?\/Type\s*\/Catalog/s, warning: 'Duplicate catalog objects' }
    ];

    for (const { pattern, warning } of corruptionIndicators) {
      if (pattern.test(bufferStr)) {
        result.warnings.push(warning);
      }
    }

    // Check for truncated file
    if (!bufferStr.endsWith('%%EOF')) {
      result.warnings.push('PDF may be truncated - missing proper EOF marker');
    }

    // Check for excessive null bytes (corruption indicator)
    const nullByteCount = (bufferStr.match(/\x00/g) || []).length;
    if (nullByteCount > bufferStr.length * 0.1) {
      result.warnings.push('High number of null bytes detected - possible corruption');
    }
  }

  /**
   * Quick validation for upload endpoints
   */
  static quickValidate(buffer: Buffer, filename?: string): { isValid: boolean; error?: string } {
    // File size check
    if (buffer.length < this.MIN_FILE_SIZE) {
      return { isValid: false, error: 'File too small' };
    }

    if (buffer.length > this.MAX_FILE_SIZE) {
      return { isValid: false, error: 'File too large' };
    }

    // Magic bytes check
    if (!buffer.subarray(0, 4).equals(this.PDF_MAGIC_BYTES)) {
      return { isValid: false, error: 'Not a valid PDF file' };
    }

    // Extension check
    if (filename && !filename.toLowerCase().endsWith('.pdf')) {
      return { isValid: false, error: 'File must have .pdf extension' };
    }

    return { isValid: true };
  }

  /**
   * Check if PDF is suitable for text extraction
   */
  static isTextExtractionFriendly(validationResult: PDFValidationResult): boolean {
    if (!validationResult.isValid) return false;
    
    // Encrypted PDFs are problematic
    if (validationResult.metadata.isEncrypted) return false;
    
    // PDFs without text need OCR
    if (!validationResult.metadata.hasText) return false;
    
    // Very high complexity might cause issues
    if (validationResult.metadata.estimatedComplexity === 'high') return false;
    
    return true;
  }
}