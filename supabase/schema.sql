-- Uruchom ten skrypt w Supabase SQL Editor.
-- RLS sprawia, że użytkownik widzi wyłącznie własne sprawy i wiadomości.

create extension if not exists pgcrypto;

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Nowa sprawa',
  document_type text not null default 'Inne pismo procesowe',
  file_name text,
  document_text text not null default '',
  context text not null default '',
  analysis jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cases add column if not exists file_url text;

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'model')),
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists cases_user_id_updated_at_idx
  on public.cases(user_id, updated_at desc);

create index if not exists chat_messages_case_id_created_at_idx
  on public.chat_messages(case_id, created_at asc);

alter table public.cases enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "Users can view their own cases" on public.cases;
create policy "Users can view their own cases"
  on public.cases for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own cases" on public.cases;
create policy "Users can create their own cases"
  on public.cases for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own cases" on public.cases;
create policy "Users can update their own cases"
  on public.cases for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own cases" on public.cases;
create policy "Users can delete their own cases"
  on public.cases for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can view their own chat messages" on public.chat_messages;
create policy "Users can view their own chat messages"
  on public.chat_messages for select
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.cases
      where public.cases.id = chat_messages.case_id
        and public.cases.user_id = auth.uid()
    )
  );

drop policy if exists "Users can create their own chat messages" on public.chat_messages;
create policy "Users can create their own chat messages"
  on public.chat_messages for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.cases
      where public.cases.id = chat_messages.case_id
        and public.cases.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete their own chat messages" on public.chat_messages;
create policy "Users can delete their own chat messages"
  on public.chat_messages for delete
  using (auth.uid() = user_id);

-- Publiczny bucket dla oryginalnych plików PDF. Ścieżki plików zawierają ID użytkownika.
insert into storage.buckets (id, name, public)
values ('case-files', 'case-files', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Authenticated users can upload case PDFs" on storage.objects;
create policy "Authenticated users can upload case PDFs"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'case-files'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "Users can delete their own case PDFs" on storage.objects;
create policy "Users can delete their own case PDFs"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'case-files'
    and owner_id = (select auth.uid()::text)
  );
