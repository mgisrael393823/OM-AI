-- Add missing chunk_index column to document_chunks table
-- This column is required for proper chunk ordering and uniqueness

-- 1) Add the missing column if it doesn't exist
ALTER TABLE public.document_chunks
  ADD COLUMN IF NOT EXISTS chunk_index integer;

-- 2) Backfill any NULLs deterministically (0-based)
WITH numbered AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY document_id ORDER BY created_at, id) - 1 AS rn
  FROM public.document_chunks
  WHERE chunk_index IS NULL
)
UPDATE public.document_chunks dc
SET chunk_index = n.rn
FROM numbered n
WHERE dc.id = n.id;

-- 3) Make it NOT NULL and enforce uniqueness per document
ALTER TABLE public.document_chunks
  ALTER COLUMN chunk_index SET NOT NULL;

-- 4) Add unique constraint for document_id + chunk_index
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

-- 5) Add index for performance
CREATE INDEX IF NOT EXISTS idx_document_chunks_chunk_index 
ON public.document_chunks(chunk_index);