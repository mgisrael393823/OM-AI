-- Enable RLS on all tables
alter table public.users enable row level security;
alter table public.documents enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.messages enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage_logs enable row level security;

-- Users policies
create policy "Users can view own profile"
  on public.users for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.users for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.users for insert
  with check (auth.uid() = id);

-- Documents policies
create policy "Users can view own documents"
  on public.documents for select
  using (auth.uid() = user_id);

create policy "Users can insert own documents"
  on public.documents for insert
  with check (auth.uid() = user_id);

create policy "Users can update own documents"
  on public.documents for update
  using (auth.uid() = user_id);

create policy "Users can delete own documents"
  on public.documents for delete
  using (auth.uid() = user_id);

-- Chat sessions policies
create policy "Users can view own chat sessions"
  on public.chat_sessions for select
  using (auth.uid() = user_id);

create policy "Users can insert own chat sessions"
  on public.chat_sessions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own chat sessions"
  on public.chat_sessions for update
  using (auth.uid() = user_id);

create policy "Users can delete own chat sessions"
  on public.chat_sessions for delete
  using (auth.uid() = user_id);

-- Messages policies
create policy "Users can view messages in own chat sessions"
  on public.messages for select
  using (
    exists (
      select 1 from public.chat_sessions
      where chat_sessions.id = messages.chat_session_id
      and chat_sessions.user_id = auth.uid()
    )
  );

create policy "Users can insert messages in own chat sessions"
  on public.messages for insert
  with check (
    exists (
      select 1 from public.chat_sessions
      where chat_sessions.id = messages.chat_session_id
      and chat_sessions.user_id = auth.uid()
    )
  );

create policy "Users can update messages in own chat sessions"
  on public.messages for update
  using (
    exists (
      select 1 from public.chat_sessions
      where chat_sessions.id = messages.chat_session_id
      and chat_sessions.user_id = auth.uid()
    )
  );

create policy "Users can delete messages in own chat sessions"
  on public.messages for delete
  using (
    exists (
      select 1 from public.chat_sessions
      where chat_sessions.id = messages.chat_session_id
      and chat_sessions.user_id = auth.uid()
    )
  );

-- Subscriptions policies
create policy "Users can view own subscriptions"
  on public.subscriptions for select
  using (auth.uid() = user_id);

create policy "Users can insert own subscriptions"
  on public.subscriptions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own subscriptions"
  on public.subscriptions for update
  using (auth.uid() = user_id);

-- Usage logs policies
create policy "Users can view own usage logs"
  on public.usage_logs for select
  using (auth.uid() = user_id);

create policy "Users can insert own usage logs"
  on public.usage_logs for insert
  with check (auth.uid() = user_id);

-- Function to automatically create user profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to create user profile on signup
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();