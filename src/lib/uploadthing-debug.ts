import type { NextApiRequest, NextApiResponse } from "next"

/**
 * Debug wrapper for NextApiResponse to intercept and log responses
 */
export class DebugResponse {
  private originalRes: NextApiResponse
  private chunks: Buffer[] = []
  
  constructor(res: NextApiResponse) {
    this.originalRes = res
    
    // Intercept write method
    const originalWrite = res.write.bind(res)
    res.write = (chunk: any, ...args: any[]) => {
      console.log("UploadThing Debug: Response write called with:", chunk)
      if (chunk) {
        this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
      return originalWrite(chunk, ...args)
    }
    
    // Intercept end method
    const originalEnd = res.end.bind(res)
    res.end = (chunk?: any, ...args: any[]) => {
      console.log("UploadThing Debug: Response end called")
      if (chunk) {
        this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
      
      if (this.chunks.length > 0) {
        const fullResponse = Buffer.concat(this.chunks).toString('utf-8')
        console.log("UploadThing Debug: Full response body:", fullResponse)
        
        // Try to parse as JSON
        try {
          const jsonData = JSON.parse(fullResponse)
          console.log("UploadThing Debug: Parsed JSON:", jsonData)
        } catch (e) {
          console.log("UploadThing Debug: Response is not valid JSON")
        }
      } else {
        console.log("UploadThing Debug: Empty response body")
      }
      
      return originalEnd(chunk, ...args)
    }
    
    // Intercept status method
    const originalStatus = res.status.bind(res)
    res.status = (code: number) => {
      console.log("UploadThing Debug: Setting status code:", code)
      return originalStatus(code)
    }
    
    // Intercept setHeader method
    const originalSetHeader = res.setHeader.bind(res)
    res.setHeader = (name: string, value: string | number | string[]) => {
      console.log("UploadThing Debug: Setting header:", name, "=", value)
      return originalSetHeader(name, value)
    }
  }
  
  getResponse(): NextApiResponse {
    return this.originalRes
  }
  
  getBodyAsString(): string {
    if (this.chunks.length === 0) {
      return "<empty response>"
    }
    return Buffer.concat(this.chunks).toString('utf-8')
  }
}