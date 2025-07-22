-- Enable required extensions
create extension if not exists "uuid-ossp";

-- Users table (extends Supabase auth.users)
create table public.users (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  full_name text,
  avatar_url text,
  subscription_tier text default 'starter' check (subscription_tier in ('starter', 'professional', 'enterprise')),
  subscription_status text default 'active' check (subscription_status in ('active', 'cancelled', 'past_due')),
  subscription_id text, -- Stripe subscription ID
  usage_count integer default 0,
  usage_limit integer default 10, -- monthly document limit
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Documents table
create table public.documents (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  filename text not null,
  original_filename text not null,
  file_size integer not null,
  file_type text not null,
  storage_path text not null, -- Supabase storage path
  status text default 'uploading' check (status in ('uploading', 'processing', 'completed', 'error')),
  extracted_text text,
  metadata jsonb default '{}',
  processed_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Chat sessions table
create table public.chat_sessions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  title text,
  document_id uuid references public.documents(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Messages table
create table public.messages (
  id uuid default uuid_generate_v4() primary key,
  chat_session_id uuid references public.chat_sessions(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  metadata jsonb default '{}',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Subscriptions table for tracking usage and billing
create table public.subscriptions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  stripe_subscription_id text unique not null,
  stripe_customer_id text not null,
  status text not null,
  current_period_start timestamp with time zone not null,
  current_period_end timestamp with time zone not null,
  cancel_at_period_end boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Usage tracking table
create table public.usage_logs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  action text not null check (action in ('document_upload', 'chat_message', 'document_analysis')),
  document_id uuid references public.documents(id) on delete set null,
  chat_session_id uuid references public.chat_sessions(id) on delete set null,
  metadata jsonb default '{}',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Indexes for performance
create index idx_documents_user_id on public.documents(user_id);
create index idx_documents_status on public.documents(status);
create index idx_chat_sessions_user_id on public.chat_sessions(user_id);
create index idx_chat_sessions_document_id on public.chat_sessions(document_id);
create index idx_messages_chat_session_id on public.messages(chat_session_id);
create index idx_messages_created_at on public.messages(created_at);
create index idx_subscriptions_user_id on public.subscriptions(user_id);
create index idx_usage_logs_user_id on public.usage_logs(user_id);
create index idx_usage_logs_created_at on public.usage_logs(created_at);

-- Updated_at trigger function
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

-- Updated_at triggers
create trigger handle_updated_at before update on public.users for each row execute function public.handle_updated_at();
create trigger handle_updated_at before update on public.chat_sessions for each row execute function public.handle_updated_at();
create trigger handle_updated_at before update on public.subscriptions for each row execute function public.handle_updated_at();