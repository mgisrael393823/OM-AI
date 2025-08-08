# MVP V1.1 - Detailed Implementation Guide

## Overview
This document provides step-by-step implementation instructions for upgrading OM-AI from V1.0 to V1.1, focusing on fixing critical issues with the PDF processing pipeline.

## Pre-Implementation Checklist

- [ ] Local Supabase running (`npx supabase status`)
- [ ] Test user created (`test+local@om.ai`)
- [ ] All V1.0 migrations applied
- [ ] `/ops/reports` directory exists
- [ ] Service role key available in `.env.development.local`

## Implementation Phases

### PHASE 0: Sanity Checks (No Code Changes)

#### Step 1: Verify Storage Objects
```bash
export SUPABASE_SERVICE_ROLE_KEY=$(grep "SUPABASE_SERVICE_ROLE_KEY=" .env.development.local | cut -d'=' -f2)

curl -s -X GET "http://127.0.0.1:54321/storage/v1/object/list/documents?prefix=" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" | jq . | tee /ops/reports/storage_list.json
```

#### Step 2: Check Latest Document
```bash
curl -s "http://127.0.0.1:54321/rest/v1/documents?select=id,filename,original_filename,storage_path,extracted_text,created_at&order=created_at.desc&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | jq . | tee /ops/reports/latest_document.json
```

**Validation**: Ensure `storage_path` matches actual Storage object `name`

### PHASE 1: Path & Naming Consistency

#### File 1: `src/pages/api/supabase-upload.ts`

**Current Issue**: Inconsistent path generation

**Fix**:
```typescript
// Before
const fileName = `${req.user.id}/${uniqueId}.pdf`

// After
const storageKey = `${req.user.id}/${uniqueId}.pdf`;
// ... upload logic ...
res.status(200).json({
  success: true,
  fileName: storageKey,  // Use consistent naming
  path: storageKey,      // Redundant but clear
  originalFileName: uploadedFile.originalFilename || 'document.pdf',
  size: uploadedFile.size
})
```

#### File 2: `src/hooks/useSupabaseUpload.ts`

**Current Issue**: Uses client-generated path

**Fix**:
```typescript
// Before
body: JSON.stringify({
  fileName,  // Client-generated
  originalFileName: file.name,
  fileSize: file.size,
  userId,
})

// After
body: JSON.stringify({
  fileName: uploadData.fileName || uploadData.path,  // Use server response
  originalFileName: file.name,
  fileSize: file.size,
  userId,
})
```

#### File 3: `src/pages/api/process-document.ts`

**Current Issue**: May recompute path

**Fix**:
```typescript
// Ensure we use exact key from request
const bucket = 'documents';
const storageKey = req.body.fileName; // Do NOT recompute

const { data: fileData, error: downloadError } = await supabase
  .storage
  .from(bucket)
  .download(storageKey)  // Use exact key

// When saving to database
const { error: updateError } = await supabase
  .from('documents')
  .insert({
    filename: storageKey,  // Storage key
    original_filename: req.body.originalFileName,  // Display name
    storage_path: storageKey,  // Same as filename
    // ... other fields
  })
```

### PHASE 2: Storage RLS Policies

#### Create Migration: `supabase/migrations/20250808170000_storage_rls.sql`

```sql
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "users insert into own folder" ON storage.objects;
DROP POLICY IF EXISTS "users read own folder" ON storage.objects;
DROP POLICY IF EXISTS "users update own folder" ON storage.objects;
DROP POLICY IF EXISTS "users delete own folder" ON storage.objects;

-- Allow authenticated users to upload to their folder
CREATE POLICY "users insert into own folder"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documents' AND 
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow users to read their own files
CREATE POLICY "users read own folder"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents' AND 
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow users to update their own files
CREATE POLICY "users update own folder"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'documents' AND 
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow users to delete their own files
CREATE POLICY "users delete own folder"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'documents' AND 
    (storage.foldername(name))[1] = auth.uid()::text
  );
```

Apply: `npx supabase db push`

### PHASE 3: Robust PDF Extraction

#### Enhanced Parser: `src/lib/agents/pdf-parser/PDFParserAgent.ts`

```typescript
import * as pdfjsLib from 'pdfjs-dist';
import Tesseract from 'tesseract.js';

interface ExtractedPage {
  pageNumber: number;
  text: string;
  stats: {
    chars: number;
    ocrUsed: boolean;
  };
}

interface ExtractResult {
  pages: ExtractedPage[];
  meta: {
    totalPages: number;
    ocrPages: number;
  };
}

class EnhancedPDFParser {
  private readonly MIN_CHARS_PER_PAGE = 120;
  private readonly HEADER_FOOTER_MARGIN = 0.07; // 7% of page height
  
  async extractPdf(buffer: ArrayBuffer): Promise<ExtractResult> {
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const totalPages = pdf.numPages;
    const pages: ExtractedPage[] = [];
    let ocrPages = 0;
    
    for (let i = 1; i <= totalPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.0 });
      
      // Try text extraction first
      let pageText = await this.extractTextWithLayout(page, viewport);
      let ocrUsed = false;
      
      // If text is too sparse, try OCR
      if (pageText.length < this.MIN_CHARS_PER_PAGE) {
        console.log(`Page ${i}: Insufficient text (${pageText.length} chars), attempting OCR`);
        pageText = await this.extractWithOCR(page, viewport);
        ocrUsed = true;
        ocrPages++;
      }
      
      pages.push({
        pageNumber: i,
        text: pageText,
        stats: {
          chars: pageText.length,
          ocrUsed
        }
      });
    }
    
    // Filter headers/footers
    this.filterRepeatingContent(pages);
    
    return {
      pages,
      meta: {
        totalPages,
        ocrPages
      }
    };
  }
  
  private async extractTextWithLayout(page: any, viewport: any): Promise<string> {
    const textContent = await page.getTextContent();
    const pageHeight = viewport.height;
    
    // Group items by Y position (lines)
    const lines = new Map<number, any[]>();
    
    for (const item of textContent.items) {
      if (!item.str || item.str.trim() === '') continue;
      
      const y = Math.round(item.transform[5]); // Y position
      
      // Skip header/footer regions
      if (y > pageHeight * (1 - this.HEADER_FOOTER_MARGIN) || 
          y < pageHeight * this.HEADER_FOOTER_MARGIN) {
        continue;
      }
      
      if (!lines.has(y)) {
        lines.set(y, []);
      }
      lines.get(y)!.push(item);
    }
    
    // Sort lines by Y (top to bottom)
    const sortedLines = Array.from(lines.entries())
      .sort((a, b) => b[0] - a[0]); // PDF Y coordinates are bottom-up
    
    // Build text with proper spacing
    const textLines: string[] = [];
    let lastY = -1;
    
    for (const [y, items] of sortedLines) {
      // Add paragraph break for large Y gaps
      if (lastY !== -1 && Math.abs(y - lastY) > 20) {
        textLines.push('');
      }
      
      // Sort items in line by X position
      items.sort((a, b) => a.transform[4] - b.transform[4]);
      
      // Build line with smart spacing
      let lineText = '';
      let lastX = -1;
      
      for (const item of items) {
        const x = item.transform[4];
        
        // Add space if there's a gap
        if (lastX !== -1 && x - lastX > 5) {
          lineText += ' ';
        }
        
        lineText += item.str;
        lastX = x + item.width;
      }
      
      textLines.push(lineText.trim());
      lastY = y;
    }
    
    return textLines.join('\n');
  }
  
  private async extractWithOCR(page: any, viewport: any): Promise<string> {
    // Render page to canvas
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;
    
    // Run OCR
    const result = await Tesseract.recognize(
      canvas.toDataURL(),
      'eng',
      {
        logger: m => console.log('OCR:', m)
      }
    );
    
    return result.data.text;
  }
  
  private filterRepeatingContent(pages: ExtractedPage[]): void {
    // Find lines that appear on >60% of pages
    const lineFrequency = new Map<string, number>();
    
    for (const page of pages) {
      const lines = page.text.split('\n');
      const uniqueLines = new Set(lines);
      
      for (const line of uniqueLines) {
        const trimmed = line.trim();
        if (trimmed.length > 0) {
          lineFrequency.set(trimmed, (lineFrequency.get(trimmed) || 0) + 1);
        }
      }
    }
    
    const threshold = pages.length * 0.6;
    const repeatingLines = new Set(
      Array.from(lineFrequency.entries())
        .filter(([_, count]) => count >= threshold)
        .map(([line, _]) => line)
    );
    
    // Remove repeating lines from all pages
    for (const page of pages) {
      const lines = page.text.split('\n');
      const filtered = lines.filter(line => !repeatingLines.has(line.trim()));
      page.text = filtered.join('\n');
    }
  }
}
```

### PHASE 4: Deterministic Chunking

#### Smart Chunker: `src/lib/chunking/index.ts`

```typescript
interface ChunkMetadata {
  pageStart: number;
  pageEnd: number;
  headings: string[];
  tokensApprox: number;
}

interface DocumentChunk {
  id: string;
  text: string;
  metadata: ChunkMetadata;
}

class SmartChunker {
  private readonly MAX_CHARS = 4000; // ~1000-1200 tokens
  private readonly OVERLAP_CHARS = 400; // 10% overlap
  
  chunk(pages: ExtractedPage[]): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    let currentChunk = '';
    let currentPages: number[] = [];
    let currentHeadings: string[] = [];
    
    for (const page of pages) {
      const lines = page.text.split('\n');
      
      for (const line of lines) {
        // Detect headings (ALL CAPS or ends with :)
        if (this.isHeading(line)) {
          currentHeadings.push(line.trim());
          
          // Prefer breaking before headings
          if (currentChunk.length > this.MAX_CHARS * 0.8) {
            chunks.push(this.createChunk(currentChunk, currentPages, currentHeadings));
            
            // Start new chunk with overlap
            const overlap = currentChunk.slice(-this.OVERLAP_CHARS);
            currentChunk = overlap + '\n' + line;
            currentPages = [page.pageNumber];
            currentHeadings = [line.trim()];
            continue;
          }
        }
        
        currentChunk += '\n' + line;
        if (!currentPages.includes(page.pageNumber)) {
          currentPages.push(page.pageNumber);
        }
        
        // Check if chunk is full
        if (currentChunk.length >= this.MAX_CHARS) {
          chunks.push(this.createChunk(currentChunk, currentPages, currentHeadings));
          
          // Start new chunk with overlap
          const overlap = currentChunk.slice(-this.OVERLAP_CHARS);
          currentChunk = overlap;
          currentPages = [page.pageNumber];
          currentHeadings = [];
        }
      }
    }
    
    // Add final chunk
    if (currentChunk.trim().length > 0) {
      chunks.push(this.createChunk(currentChunk, currentPages, currentHeadings));
    }
    
    return chunks;
  }
  
  private isHeading(line: string): boolean {
    const trimmed = line.trim();
    // ALL CAPS (min 3 words)
    if (trimmed === trimmed.toUpperCase() && trimmed.split(' ').length >= 3) {
      return true;
    }
    // Ends with colon
    if (trimmed.endsWith(':') && trimmed.length > 10) {
      return true;
    }
    // Common heading patterns
    if (/^(EXECUTIVE SUMMARY|INVESTMENT|PROPERTY|LOCATION|FINANCIAL)/i.test(trimmed)) {
      return true;
    }
    return false;
  }
  
  private createChunk(
    text: string, 
    pages: number[], 
    headings: string[]
  ): DocumentChunk {
    return {
      id: uuidv4(),
      text: text.trim(),
      metadata: {
        pageStart: Math.min(...pages),
        pageEnd: Math.max(...pages),
        headings: [...new Set(headings)].slice(0, 5), // Max 5 headings
        tokensApprox: Math.round(text.length / 4) // Rough estimate
      }
    };
  }
}
```

### PHASE 5: Processing Job Tracking

#### Migration: `supabase/migrations/20250808171000_processing_jobs_v2.sql`

```sql
-- Drop if exists (for V1.1 update)
DROP TABLE IF EXISTS public.processing_jobs CASCADE;

-- Create enhanced processing jobs table
CREATE TABLE public.processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('pending', 'processing', 'completed', 'error')),
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_processing_jobs_document ON public.processing_jobs(document_id);
CREATE INDEX idx_processing_jobs_status ON public.processing_jobs(status, created_at);
CREATE INDEX idx_processing_jobs_user ON public.processing_jobs(user_id);

-- RLS
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own jobs" ON public.processing_jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role manages jobs" ON public.processing_jobs
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');
```

#### Update Process Flow: `src/pages/api/process-document.ts`

```typescript
// At start of processing
const { data: job, error: jobError } = await supabase
  .from('processing_jobs')
  .insert({
    document_id: documentId,
    user_id: userId,
    status: 'processing',
    metadata: { originalFileName, fileSize }
  })
  .select()
  .single();

if (jobError) {
  console.error('Failed to create job record:', jobError);
}

try {
  // ... processing logic ...
  
  // On success
  if (job) {
    await supabase
      .from('processing_jobs')
      .update({
        status: 'completed',
        finished_at: new Date().toISOString()
      })
      .eq('id', job.id);
  }
} catch (error) {
  // On failure
  if (job) {
    await supabase
      .from('processing_jobs')
      .update({
        status: 'error',
        error_message: error.message,
        finished_at: new Date().toISOString()
      })
      .eq('id', job.id);
  }
  throw error;
}
```

### PHASE 6: Fix Document Display

#### Update UI Component: `src/pages/app.tsx`

```typescript
// In the document attachment indicator
{selectedDocumentId && (
  <div className="mb-4 flex items-center gap-2 px-4 py-2 bg-primary/20 backdrop-blur-sm rounded-lg w-fit max-w-xs sm:max-w-md">
    <FileText className="h-4 w-4 text-primary flex-shrink-0" />
    <span 
      className={`text-primary ${componentTypography.form.label} truncate`} 
      title={selectedDocument?.original_filename || selectedDocument?.filename || 'Document attached'}
    >
      Attached: {selectedDocument?.original_filename || 
                 selectedDocument?.filename?.split('/').pop()?.replace('.pdf', '') || 
                 'Document'}
    </span>
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        setSelectedDocumentId(null);
        setSelectedDocument(null);
      }}
      className="h-6 w-6 p-0 text-primary hover:text-primary/80"
    >
      <X className="h-4 w-4" />
    </Button>
  </div>
)}
```

### PHASE 7: Chat Prompt Tuning

#### Enhanced Prompt: `src/lib/prompts/om-analyst.ts`

```typescript
export const CRE_ANALYST_PROMPT = `You are a commercial real estate analyst reviewing offering memorandums.

CRITICAL RULES:
1. Use ONLY information from the provided document chunks
2. If a metric is not found, explicitly state "Not found in document"
3. Always cite page numbers from chunk metadata
4. Never invent or estimate missing data
5. Focus on extracting these CRE metrics when available:
   - Asking Price
   - Cap Rate
   - NOI (Net Operating Income)
   - Year Built
   - Total Units/SF
   - Occupancy Rate
   - Market Rent
   - Location/Address

RESPONSE FORMAT:
- Use tables for metrics
- Include page citations in format: (Pages X-Y)
- Keep summaries concise
- Highlight key risks and opportunities

DOCUMENT CONTEXT:
{chunks}

USER QUESTION:
{question}

Respond based ONLY on the document content above. If information is missing, say so explicitly.`;
```

### PHASE 8: Smoke Test Script

#### Create: `scripts/smoke_mvp.ts`

```typescript
import { createClient } from '@supabase/supabase-js';
import FormData from 'form-data';
import fs from 'fs';
import fetch from 'node-fetch';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function smokeTest() {
  console.log('🔍 Starting MVP Smoke Test...\n');
  
  try {
    // 1. Upload test PDF
    console.log('📤 Uploading test PDF...');
    const testPdf = fs.readFileSync('./test-om-pdfs/simple-test.pdf');
    const formData = new FormData();
    formData.append('file', testPdf, 'simple-test.pdf');
    
    const uploadResponse = await fetch('http://localhost:3000/api/supabase-upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.TEST_USER_TOKEN}`
      },
      body: formData
    });
    
    const uploadResult = await uploadResponse.json();
    console.log('✅ Upload complete:', uploadResult.fileName);
    
    // 2. Process document
    console.log('\n🔄 Processing document...');
    const processResponse = await fetch('http://localhost:3000/api/process-document', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TEST_USER_TOKEN}`
      },
      body: JSON.stringify({
        fileName: uploadResult.fileName,
        originalFileName: 'simple-test.pdf',
        fileSize: testPdf.length,
        userId: process.env.TEST_USER_ID
      })
    });
    
    const processResult = await processResponse.json();
    const documentId = processResult.document.id;
    console.log('✅ Processing complete:', documentId);
    
    // 3. Verify extraction
    console.log('\n📊 Verifying extraction...');
    const { data: document } = await supabase
      .from('documents')
      .select('extracted_text')
      .eq('id', documentId)
      .single();
    
    const extractedLength = document?.extracted_text?.length || 0;
    console.log(`✅ Extracted text: ${extractedLength} characters`);
    
    if (extractedLength < 500) {
      throw new Error('Extraction too short');
    }
    
    // 4. Check chunks
    const { data: chunks, count } = await supabase
      .from('document_chunks')
      .select('id', { count: 'exact' })
      .eq('document_id', documentId);
    
    console.log(`✅ Chunks created: ${count}`);
    
    if (count! < 3) {
      throw new Error('Too few chunks created');
    }
    
    // 5. Check job status
    const { data: job } = await supabase
      .from('processing_jobs')
      .select('status, finished_at')
      .eq('document_id', documentId)
      .single();
    
    console.log(`✅ Job status: ${job?.status}`);
    
    if (job?.status !== 'completed') {
      throw new Error('Job did not complete');
    }
    
    // 6. Test chat query
    console.log('\n💬 Testing chat query...');
    const chatResponse = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TEST_USER_TOKEN}`
      },
      body: JSON.stringify({
        message: 'What is the property address and year built?',
        documentId: documentId
      })
    });
    
    const chatResult = await chatResponse.json();
    console.log('✅ Chat response received');
    console.log('Response preview:', chatResult.response.substring(0, 200) + '...');
    
    // Verify response quality
    if (chatResult.response.includes('Not found in document') || 
        chatResult.response.includes('Page')) {
      console.log('✅ Response includes proper citations');
    } else {
      console.warn('⚠️  Response may lack proper citations');
    }
    
    console.log('\n🎉 Smoke test PASSED!\n');
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Smoke test FAILED:', error);
    process.exit(1);
  }
}

// Run test
smokeTest();
```

#### Add NPM Script: `package.json`

```json
{
  "scripts": {
    "smoke:mvp": "tsx scripts/smoke_mvp.ts"
  }
}
```

## Validation & Testing

### Manual Testing Checklist

- [ ] Upload a complex PDF (multi-column, tables, images)
- [ ] Verify original filename displays correctly
- [ ] Check extracted text quality in database
- [ ] Confirm chunks have page metadata
- [ ] Test chat with specific metric questions
- [ ] Verify "Not found" responses for missing data
- [ ] Check page citations in responses

### Performance Targets

| Metric | V1.0 Current | V1.1 Target |
|--------|--------------|-------------|
| PDF Processing | 5-10s | 3-5s |
| Text Quality | 60% | 85% |
| Chat Response | 2-3s | <2s |
| Chunk Accuracy | Basic | Page-aware |
| OCR Coverage | 0% | 100% (when needed) |

## Rollback Plan

If V1.1 introduces critical issues:

1. **Database Rollback**:
```bash
npx supabase migration repair --version 20250808140000
npx supabase db reset --local
```

2. **Code Rollback**:
```bash
git checkout v1.0-stable
npm install
npm run dev
```

3. **Data Recovery**:
- Documents remain in storage
- Re-run processing with V1.0 parser

## Post-Implementation

### Documentation Updates
- Update API documentation
- Create user guide for new features
- Document known limitations

### Monitoring Setup
- Add performance metrics logging
- Set up error alerting
- Create usage dashboards

### Next Steps (V1.2+)
- Semantic search implementation
- Multi-document analysis
- Export functionality
- Advanced table extraction
- Financial model detection

---

**Document Version**: 1.1
**Last Updated**: August 8, 2025
**Implementation Time**: ~4-6 hours
**Risk Level**: Medium (with rollback plan)