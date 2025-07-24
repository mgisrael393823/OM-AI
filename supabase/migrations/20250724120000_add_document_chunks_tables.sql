-- Add document chunks table for storing parsed PDF content
create table public.document_chunks (
  id uuid default uuid_generate_v4() primary key,
  document_id uuid references public.documents(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  chunk_id text not null, -- Application-generated chunk identifier
  content text not null, -- The actual text content of the chunk
  page_number integer not null,
  chunk_type text not null check (chunk_type in ('paragraph', 'table', 'header', 'footer', 'list')),
  tokens integer, -- Token count for the chunk
  metadata jsonb default '{}', -- Additional chunk metadata (startY, endY, etc.)
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Add document tables table for storing extracted table data
create table public.document_tables (
  id uuid default uuid_generate_v4() primary key,
  document_id uuid references public.documents(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  page_number integer not null,
  table_data jsonb not null, -- Array of table rows
  headers jsonb, -- Table headers if available
  position jsonb, -- Position info: {x, y, width, height}
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Add indexes for performance
create index idx_document_chunks_document_id on public.document_chunks(document_id);
create index idx_document_chunks_user_id on public.document_chunks(user_id);
create index idx_document_chunks_page_number on public.document_chunks(page_number);
create index idx_document_chunks_chunk_type on public.document_chunks(chunk_type);

create index idx_document_tables_document_id on public.document_tables(document_id);
create index idx_document_tables_user_id on public.document_tables(user_id);
create index idx_document_tables_page_number on public.document_tables(page_number);

-- Add full text search index for document content
create index idx_document_chunks_content_fts on public.document_chunks using gin(to_tsvector('english', content));

-- Add unique constraint to prevent duplicate chunks
create unique index idx_document_chunks_unique on public.document_chunks(document_id, chunk_id);