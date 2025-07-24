-- Temporary script to add document chunks tables if they don't exist

-- Check if document_chunks table exists, if not create it
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'document_chunks') THEN
        -- Add document chunks table for storing parsed PDF content
        CREATE TABLE public.document_chunks (
          id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
          document_id uuid REFERENCES public.documents(id) ON DELETE CASCADE NOT NULL,
          user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
          chunk_id text NOT NULL, -- Application-generated chunk identifier
          content text NOT NULL, -- The actual text content of the chunk
          page_number integer NOT NULL,
          chunk_type text NOT NULL CHECK (chunk_type IN ('paragraph', 'table', 'header', 'footer', 'list')),
          tokens integer, -- Token count for the chunk
          metadata jsonb DEFAULT '{}', -- Additional chunk metadata (startY, endY, etc.)
          created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
        );

        -- Add indexes for performance
        CREATE INDEX idx_document_chunks_document_id ON public.document_chunks(document_id);
        CREATE INDEX idx_document_chunks_user_id ON public.document_chunks(user_id);
        CREATE INDEX idx_document_chunks_page_number ON public.document_chunks(page_number);
        CREATE INDEX idx_document_chunks_chunk_type ON public.document_chunks(chunk_type);
        
        -- Add full text search index for document content
        CREATE INDEX idx_document_chunks_content_fts ON public.document_chunks USING gin(to_tsvector('english', content));
        
        -- Add unique constraint to prevent duplicate chunks
        CREATE UNIQUE INDEX idx_document_chunks_unique ON public.document_chunks(document_id, chunk_id);

        -- Enable RLS
        ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

        -- RLS Policies for document_chunks
        CREATE POLICY "Users can view their own document chunks" 
          ON public.document_chunks FOR SELECT 
          USING (auth.uid() = user_id);

        CREATE POLICY "Users can insert their own document chunks" 
          ON public.document_chunks FOR INSERT 
          WITH CHECK (auth.uid() = user_id);

        CREATE POLICY "Users can update their own document chunks" 
          ON public.document_chunks FOR UPDATE 
          USING (auth.uid() = user_id);

        CREATE POLICY "Users can delete their own document chunks" 
          ON public.document_chunks FOR DELETE 
          USING (auth.uid() = user_id);

        RAISE NOTICE 'Created document_chunks table successfully';
    ELSE
        RAISE NOTICE 'document_chunks table already exists';
    END IF;
END $$;

-- Check if document_tables table exists, if not create it
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'document_tables') THEN
        -- Add document tables table for storing extracted table data
        CREATE TABLE public.document_tables (
          id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
          document_id uuid REFERENCES public.documents(id) ON DELETE CASCADE NOT NULL,
          user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
          page_number integer NOT NULL,
          table_data jsonb NOT NULL, -- Array of table rows
          headers jsonb, -- Table headers if available
          position jsonb, -- Position info: {x, y, width, height}
          created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
        );

        -- Add indexes for performance
        CREATE INDEX idx_document_tables_document_id ON public.document_tables(document_id);
        CREATE INDEX idx_document_tables_user_id ON public.document_tables(user_id);
        CREATE INDEX idx_document_tables_page_number ON public.document_tables(page_number);

        -- Enable RLS
        ALTER TABLE public.document_tables ENABLE ROW LEVEL SECURITY;

        -- RLS Policies for document_tables
        CREATE POLICY "Users can view their own document tables" 
          ON public.document_tables FOR SELECT 
          USING (auth.uid() = user_id);

        CREATE POLICY "Users can insert their own document tables" 
          ON public.document_tables FOR INSERT 
          WITH CHECK (auth.uid() = user_id);

        CREATE POLICY "Users can update their own document tables" 
          ON public.document_tables FOR UPDATE 
          USING (auth.uid() = user_id);

        CREATE POLICY "Users can delete their own document tables" 
          ON public.document_tables FOR DELETE 
          USING (auth.uid() = user_id);

        RAISE NOTICE 'Created document_tables table successfully';
    ELSE
        RAISE NOTICE 'document_tables table already exists';
    END IF;
END $$;