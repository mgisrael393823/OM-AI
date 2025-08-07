-- Create storage bucket for documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents', 
  false,
  10485760, -- 10MB
  ARRAY['application/pdf']
) ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage.objects (only if not already enabled)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'storage' AND tablename = 'objects' 
    AND rowsecurity = true
  ) THEN
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Policies: Create only if they don't exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can upload their own documents' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "Users can upload their own documents" ON storage.objects
    FOR INSERT WITH CHECK (
      bucket_id = 'documents' AND 
      auth.uid()::text = (storage.foldername(name))[1]
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own documents' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "Users can view their own documents" ON storage.objects
    FOR SELECT USING (
      bucket_id = 'documents' AND 
      auth.uid()::text = (storage.foldername(name))[1]
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete their own documents' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "Users can delete their own documents" ON storage.objects
    FOR DELETE USING (
      bucket_id = 'documents' AND 
      auth.uid()::text = (storage.foldername(name))[1]
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update their own documents' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "Users can update their own documents" ON storage.objects
    FOR UPDATE USING (
      bucket_id = 'documents' AND 
      auth.uid()::text = (storage.foldername(name))[1]
    );
  END IF;
END $$;