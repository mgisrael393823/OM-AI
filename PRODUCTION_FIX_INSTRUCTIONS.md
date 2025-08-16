# Production Fix: Missing chunk_index Column

## Issue
Document uploads are failing in production with error:
- "Document missing after processing"
- PostgREST error PGRST204: "Could not find the 'chunk_index' column of 'document_chunks'"

## Root Cause
The production database schema is missing the `chunk_index` column in the `public.document_chunks` table.

## Fix Instructions

### Option 1: Apply via Supabase Dashboard (Recommended)
1. Go to your production Supabase Dashboard
2. Navigate to SQL Editor
3. Copy and run the contents of: `supabase/migrations/20250816104833_fix_chunk_index_production.sql`
4. Verify success message: "SUCCESS: chunk_index column added to document_chunks table"
5. Test document upload functionality

### Option 2: Quick Hotfix (Emergency Only)
If you need an immediate fix, run this simplified SQL:

```sql
-- Add the column with default
ALTER TABLE public.document_chunks
  ADD COLUMN IF NOT EXISTS chunk_index integer DEFAULT 0 NOT NULL;

-- Reload PostgREST schema cache
SELECT pg_notify('pgrst', 'reload schema');
```

### Option 3: Apply via Supabase CLI
```bash
# If you have Supabase CLI configured for production
supabase db push --db-url "postgresql://postgres:[password]@[host]:5432/postgres"
```

## Verification Steps
1. After applying the migration, verify the column exists:
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'document_chunks' 
AND column_name = 'chunk_index';
```

2. Test document upload:
   - Upload a test PDF document
   - Verify it processes successfully
   - Check that chunks are created with proper indices

## What This Migration Does
1. Adds `chunk_index` column with default value of 0
2. Backfills existing rows with correct sequential indices
3. Adds unique constraint on (document_id, chunk_index)
4. Creates index for query performance
5. Refreshes PostgREST schema cache
6. Verifies the column was added successfully

## Important Notes
- This migration is idempotent (safe to run multiple times)
- It will NOT affect existing data beyond adding proper indices
- The schema cache refresh ensures immediate API recognition
- No application code changes are required

## Rollback (if needed)
```sql
-- Remove the column and constraints
ALTER TABLE public.document_chunks 
DROP COLUMN IF EXISTS chunk_index CASCADE;

-- Refresh schema cache
SELECT pg_notify('pgrst', 'reload schema');
```

## Prevention
Ensure all migrations are applied to production before deploying application code that depends on schema changes.