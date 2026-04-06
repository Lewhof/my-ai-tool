-- Lewhof AI Dashboard — Database Schema
-- Run this in Supabase SQL Editor

-- 1. Auto-update trigger function
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 2. Chat threads
create table chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null default 'New Chat',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger chat_threads_updated_at
  before update on chat_threads
  for each row execute function update_updated_at();

-- 3. Chat messages
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references chat_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  model text,
  tokens_used integer,
  created_at timestamptz default now()
);

create index idx_messages_thread_created on chat_messages(thread_id, created_at);

-- 4. Documents
create table documents (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  file_path text not null,
  file_type text not null,
  file_size integer not null,
  created_at timestamptz default now()
);

-- 5. Workflows
create table workflows (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  description text,
  steps jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger workflows_updated_at
  before update on workflows
  for each row execute function update_updated_at();

-- 6. Workflow runs
create table workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references workflows(id) on delete cascade,
  input text not null,
  output jsonb default '[]'::jsonb,
  status text not null check (status in ('running', 'completed', 'failed')) default 'running',
  created_at timestamptz default now()
);

-- 7. User settings
create table user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id text unique not null,
  default_model text default 'fast',
  dashboard_layout jsonb default '["recent-chats","quick-actions","documents","activity"]'::jsonb,
  theme text default 'dark',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger user_settings_updated_at
  before update on user_settings
  for each row execute function update_updated_at();

-- 8. Enable RLS on all tables
alter table chat_threads enable row level security;
alter table chat_messages enable row level security;
alter table documents enable row level security;
alter table workflows enable row level security;
alter table workflow_runs enable row level security;
alter table user_settings enable row level security;

-- 9. RLS policies (service role bypasses these, but defense-in-depth)
create policy "Users own their threads" on chat_threads for all using (user_id = current_setting('request.jwt.claim.sub', true));
create policy "Users own their messages" on chat_messages for all using (thread_id in (select id from chat_threads where user_id = current_setting('request.jwt.claim.sub', true)));
create policy "Users own their documents" on documents for all using (user_id = current_setting('request.jwt.claim.sub', true));
create policy "Users own their workflows" on workflows for all using (user_id = current_setting('request.jwt.claim.sub', true));
create policy "Users own their runs" on workflow_runs for all using (workflow_id in (select id from workflows where user_id = current_setting('request.jwt.claim.sub', true)));
create policy "Users own their settings" on user_settings for all using (user_id = current_setting('request.jwt.claim.sub', true));

-- 10. Diagrams share token migration
ALTER TABLE diagrams ADD COLUMN IF NOT EXISTS share_token text UNIQUE;

-- 11. Create storage bucket for documents
insert into storage.buckets (id, name, public) values ('documents', 'documents', false);
