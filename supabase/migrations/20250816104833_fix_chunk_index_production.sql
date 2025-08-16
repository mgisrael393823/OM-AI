-- Fix production: Add missing chunk_index column to document_chunks table
-- This fixes the "Document missing after processing" error in production
-- Error: PGRST204 - Could not find the 'chunk_index' column

-- 1) Add the missing column with a default value
ALTER TABLE public.document_chunks
  ADD COLUMN IF NOT EXISTS chunk_index integer DEFAULT 0 NOT NULL;

-- 2) Backfill any existing rows with proper index values (0-based)
-- This ensures existing documents have correct chunk ordering
WITH numbered AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY document_id ORDER BY created_at, id) - 1 AS rn
  FROM public.document_chunks
  WHERE chunk_index = 0  -- Only update default values
)
UPDATE public.document_chunks dc
SET chunk_index = n.rn
FROM numbered n
WHERE dc.id = n.id AND dc.chunk_index = 0;

-- 3) Add unique constraint to prevent duplicate chunk indices per document
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'document_chunks_document_id_chunk_index_key'
  ) THEN
    ALTER TABLE public.document_chunks
      ADD CONSTRAINT document_chunks_document_id_chunk_index_key
      UNIQUE (document_id, chunk_index);
  END IF;
END$$;

-- 4) Add index for performance on chunk_index queries
CREATE INDEX IF NOT EXISTS idx_document_chunks_chunk_index 
ON public.document_chunks(chunk_index);

-- 5) Force PostgREST to reload its schema cache immediately
-- This ensures the API recognizes the new column without restart
SELECT pg_notify('pgrst', 'reload schema');

-- 6) Verify the column exists and has correct properties
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'document_chunks' 
    AND column_name = 'chunk_index'
  ) THEN
    RAISE NOTICE 'SUCCESS: chunk_index column added to document_chunks table';
  ELSE
    RAISE EXCEPTION 'ERROR: Failed to add chunk_index column';
  END IF;
END$$;