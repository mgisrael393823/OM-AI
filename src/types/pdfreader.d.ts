declare module "pdfreader" {
  export interface PdfReaderItem {
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    text?: string;
    page?: number;
    R?: Array<{
      T: string;
      S: number;
      TS: Array<number>;
    }>;
    file?: {
      buffer?: Buffer;
      pages?: number;
    };
  }

  export class PdfReader {
    constructor(options?: {
      password?: string;
      debug?: boolean;
    });
    
    parseFileItems(
      path: string, 
      callback: (err: Error | null, item: PdfReaderItem | null) => void
    ): void;
    
    parseBuffer(
      buffer: Buffer, 
      callback: (err: Error | null, item: PdfReaderItem | null) => void
    ): void;
  }
}