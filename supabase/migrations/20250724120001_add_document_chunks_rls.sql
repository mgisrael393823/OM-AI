-- Enable RLS on new tables
alter table public.document_chunks enable row level security;
alter table public.document_tables enable row level security;

-- RLS Policies for document_chunks
-- Users can only access their own document chunks
create policy "Users can view their own document chunks" 
  on public.document_chunks for select 
  using (auth.uid() = user_id);

create policy "Users can insert their own document chunks" 
  on public.document_chunks for insert 
  with check (auth.uid() = user_id);

create policy "Users can update their own document chunks" 
  on public.document_chunks for update 
  using (auth.uid() = user_id);

create policy "Users can delete their own document chunks" 
  on public.document_chunks for delete 
  using (auth.uid() = user_id);

-- RLS Policies for document_tables
-- Users can only access their own document tables
create policy "Users can view their own document tables" 
  on public.document_tables for select 
  using (auth.uid() = user_id);

create policy "Users can insert their own document tables" 
  on public.document_tables for insert 
  with check (auth.uid() = user_id);

create policy "Users can update their own document tables" 
  on public.document_tables for update 
  using (auth.uid() = user_id);

create policy "Users can delete their own document tables" 
  on public.document_tables for delete 
  using (auth.uid() = user_id);