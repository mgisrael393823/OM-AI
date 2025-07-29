# UploadThing to Supabase Storage Migration Plan

## Overview

### The Situation
After multiple days of troubleshooting UploadThing v7 integration issues, including:
- 401 "Invalid API Key" errors during route-metadata registration
- 415 "Unsupported Media Type" errors with presigned URL uploads
- Complex debugging of Fastify Content-Type requirements
- Inconsistent behavior between cURL tests and React implementation

**Decision**: Complete removal of UploadThing and migration to Supabase Storage for more reliable, integrated file uploads.

### Current System State
- **Working**: Supabase authentication, database, and storage infrastructure
- **Problematic**: UploadThing v7 integration causing persistent upload failures
- **Goal**: Seamless file uploads using existing Supabase infrastructure

## Files Currently Using UploadThing

### Core UploadThing Files (TO BE REMOVED)
```
src/utils/uploadthing.ts          # UploadThing React helpers
src/lib/uploadthing.ts            # File router with middleware & onUploadComplete
src/hooks/useUploadThingV7.ts     # Custom hook created during debugging
app/api/uploadthing/route.ts      # API route handler
```

### Files to Update
```
src/components/app/DocumentUpload.tsx  # Main upload component
package.json                           # Remove UploadThing dependencies
.env.local                            # Remove UPLOADTHING_TOKEN
```

### Database Schema
```sql
-- Current documents table includes UploadThing-specific fields:
-- uploadthing_key, uploadthing_url (in metadata column)
-- These will be removed/replaced with Supabase storage_path
```

## Implementation Plan

### Phase 1: Assessment & Cleanup
**Duration**: 30 minutes

#### 1.1 Dependency Removal
```bash
npm uninstall uploadthing @uploadthing/react
```

#### 1.2 Environment Variable Cleanup
- Remove `UPLOADTHING_TOKEN` from `.env.local`
- Remove from Vercel dashboard (if added)

#### 1.3 File Deletion
- Delete `src/utils/uploadthing.ts`
- Delete `src/lib/uploadthing.ts`  
- Delete `src/hooks/useUploadThingV7.ts`
- Delete `app/api/uploadthing/route.ts`

### Phase 2: Supabase Storage Verification (SIMPLIFIED)
**Duration**: 15 minutes

#### 2.1 ✅ Storage Bucket Already Exists
- `documents` bucket is configured and working
- Current file size limit: 10MB (may need to increase to 16MB)
- MIME types: `{application/pdf}` (already restricted to PDFs)
- 13 existing files confirm the bucket is functional

#### 2.2 ✅ RLS Policies Already Configured  
- Storage RLS policies are already in place
- No additional policy configuration needed

#### 2.3 Optional: Increase File Size Limit
```sql
-- Only if you need files larger than 10MB
UPDATE storage.buckets 
SET file_size_limit = 16777216  -- 16MB in bytes
WHERE id = 'documents';
```

### Phase 3: Supabase Upload Hook Implementation
**Duration**: 1 hour

#### 3.1 Create useSupabaseUpload Hook
```typescript
// src/hooks/useSupabaseUpload.ts
interface UseSupabaseUploadResult {
  uploadFile: (file: File) => Promise<{ url: string; path: string }>;
  progress: number;
  isUploading: boolean;
  error: string | null;
  reset: () => void;
}

export const useSupabaseUpload = (): UseSupabaseUploadResult => {
  // Implementation details:
  // - File validation (PDF, 16MB max)
  // - Progress tracking using XMLHttpRequest
  // - Error handling with user-friendly messages
  // - Automatic retry logic
}
```

#### 3.2 Hook Features Required
- **File Validation**: PDF type, 16MB size limit
- **Progress Tracking**: Real-time upload progress
- **Error Handling**: Network errors, file size errors, auth errors
- **Folder Structure**: `{userId}/{timestamp}-{filename}.pdf`

### Phase 4: Document Processing Migration
**Duration**: 1 hour

#### 4.1 Extract Processing Logic
```typescript
// Current processing is in src/lib/uploadthing.ts onUploadComplete
// Need to extract:
// - PDF validation using PDFValidator
// - PDF parsing using PDFParserAgent
// - Document metadata storage
// - Document chunks storage
// - Table extraction and storage
```

#### 4.2 Create New Processing Handler
```typescript
// src/lib/document-processor.ts
export const processUploadedDocument = async (
  file: File,
  storagePath: string,
  userId: string
) => {
  // 1. Fetch file from Supabase Storage
  // 2. Run PDF validation
  // 3. Parse with PDFParserAgent
  // 4. Store document metadata
  // 5. Store chunks and tables
  // 6. Handle errors and cleanup
}
```

### Phase 5: DocumentUpload Component Update
**Duration**: 45 minutes

#### 5.1 Replace UploadThing Hook
```typescript
// Before
const { startUpload, isUploading } = useUploadThing("pdfUploader", {...});

// After  
const { uploadFile, isUploading, progress, error } = useSupabaseUpload();
```

#### 5.2 Update Upload Flow
```typescript
const handleUpload = async (files: File[]) => {
  for (const file of files) {
    try {
      const { url, path } = await uploadFile(file);
      await processUploadedDocument(file, path, userId);
      // Update UI with success
    } catch (error) {
      // Handle error state
    }
  }
};
```

### Phase 6: Database Schema Updates (MINIMAL)
**Duration**: 5 minutes

#### 6.1 ✅ Database Schema Already Perfect
- `documents` table already has `storage_path` field
- No UploadThing-specific fields to remove from schema
- Database is ready for Supabase Storage integration

### Phase 7: Testing & Validation
**Duration**: 1 hour

#### 7.1 Unit Tests
- Test upload hook with various file types/sizes
- Test error conditions (network, auth, file size)
- Test progress tracking accuracy

#### 7.2 Integration Tests
- End-to-end upload → processing → storage flow
- User authentication and file access permissions
- Document listing and retrieval

#### 7.3 Load Testing
- Multiple concurrent uploads
- Large file uploads (up to 16MB)
- Network interruption handling

### Phase 8: Deployment & Monitoring
**Duration**: 30 minutes

#### 8.1 Environment Setup
- Verify Supabase credentials in all environments
- Configure storage policies for production
- Set up upload success/failure monitoring

#### 8.2 Rollback Preparation
```bash
# Create backup branch before starting
git checkout -b backup/uploadthing-implementation
git push origin backup/uploadthing-implementation
```

## API Specifications

### useSupabaseUpload Hook API
```typescript
interface UseSupabaseUploadOptions {
  maxFileSize?: number;      // Default: 16MB
  allowedTypes?: string[];   // Default: ['application/pdf']
  folder?: string;          // Default: userId
}

interface UseSupabaseUploadResult {
  uploadFile: (file: File) => Promise<UploadResult>;
  progress: number;         // 0-100
  isUploading: boolean;
  error: string | null;
  reset: () => void;
}

interface UploadResult {
  url: string;             // Public URL for file access
  path: string;            // Storage path for database
  size: number;            // File size in bytes
}
```

### File Processing API
```typescript
interface ProcessingResult {
  document: {
    id: string;
    filename: string;
    storage_path: string;
    file_size: number;
    status: 'completed' | 'processing' | 'error';
  };
  chunks: DocumentChunk[];
  tables: DocumentTable[];
  error?: string;
}
```

## Testing Checklist

### Functional Tests
- [ ] File upload works end-to-end
- [ ] Progress tracking displays correctly  
- [ ] Error handling works for various scenarios
- [ ] File validation (size/type) functions properly
- [ ] PDF processing pipeline triggers correctly
- [ ] Document listing updates after upload
- [ ] File access permissions work correctly
- [ ] User authentication integration works

### Error Scenarios
- [ ] File too large (>16MB)
- [ ] Invalid file type (non-PDF)
- [ ] Network interruption during upload
- [ ] Authentication token expired
- [ ] Storage quota exceeded
- [ ] Processing pipeline failure

### Performance Tests
- [ ] Upload speed comparable to UploadThing
- [ ] Multiple concurrent uploads
- [ ] Large file upload (16MB) completes
- [ ] Progress tracking remains responsive

## Rollback Procedure

### If Issues Arise During Migration
1. **Stop all changes immediately**
2. **Revert to backup branch**:
   ```bash
   git checkout backup/uploadthing-implementation
   git push origin main --force
   ```
3. **Restore environment variables**:
   ```bash
   # Add back to .env.local
   UPLOADTHING_TOKEN=eyJhcGlLZXkiOi...
   ```
4. **Reinstall dependencies**:
   ```bash
   npm install uploadthing @uploadthing/react
   ```

### Rollback Decision Triggers
- Upload success rate drops below 95%
- Processing pipeline fails consistently  
- User authentication issues
- Performance significantly worse than before
- Any blocking bugs discovered in testing

## Success Metrics

### Technical Metrics
- **Upload Success Rate**: >99%
- **Processing Success Rate**: >98%  
- **Average Upload Time**: <30 seconds for 10MB file
- **Error Recovery**: Automatic retry on network issues

### User Experience Metrics
- **Upload UI Responsiveness**: No blocking operations
- **Error Messages**: Clear, actionable error messages
- **Progress Feedback**: Real-time progress updates
- **File Access**: Immediate access after processing

## Next Steps for Implementation

1. **Start with Phase 1**: Clean removal of all UploadThing code
2. **Verify Supabase Setup**: Ensure storage bucket and policies are correct
3. **Implement Upload Hook**: Create robust, tested upload functionality
4. **Migrate Processing**: Extract and adapt PDF processing logic
5. **Update UI**: Seamless replacement in DocumentUpload component
6. **Test Thoroughly**: All scenarios, edge cases, and error conditions
7. **Deploy Gradually**: Test in staging before production rollout

---

**Expected Timeline**: 3-4 hours total implementation time (reduced due to existing infrastructure)
**Risk Level**: Low (using proven Supabase infrastructure)
**Benefits**: Simplified architecture, better reliability, lower costs