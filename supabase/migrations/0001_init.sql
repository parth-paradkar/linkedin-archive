-- LinkedIn Archive: shared workspace schema.
--
-- SECURITY: the anon key is embedded in the extension and in the browser
-- bundle, so RLS is the only thing standing between a stranger and this data.
-- Every table below enables RLS and every policy requires is_member().

create extension if not exists pgcrypto;

-- Members of the workspace. Rows are added by hand in the SQL editor; no API
-- path grants insert, update or delete (see policies at the foot of this file).
create table public.allowed_emails (
  email text primary key
);

-- One row per LinkedIn person. Keyed by slug so two members saving the same
-- person converge on a single row instead of creating duplicates.
create table public.profiles (
  slug       text primary key,
  url        text not null,
  name       text not null default '',
  headline   text not null default '',
  company    text not null default '',
  role       text not null default '',
  location   text not null default '',
  about      text not null default '',
  photo_url  text not null default '',
  tags       text[] not null default '{}',
  saved_by   uuid references auth.users (id) on delete set null,
  saved_at   timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Append-only, attributed. Nothing here overwrites another member's writing.
create table public.notes (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null references public.profiles (slug) on delete cascade,
  author     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body       text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  edited_at  timestamptz
);

create index notes_slug_created_at_idx on public.notes (slug, created_at);
create index profiles_tags_idx on public.profiles using gin (tags);
create index profiles_saved_at_idx on public.profiles (saved_at desc);

-- Is the caller on the allowlist? security definer so the check can read
-- allowed_emails regardless of the caller's own policies, with search_path
-- pinned so the function cannot be hijacked by a shadowing schema.
create function public.is_member() returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.allowed_emails
    where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

alter table public.allowed_emails enable row level security;
alter table public.profiles       enable row level security;
alter table public.notes          enable row level security;

-- Members may see who else is a member. Nobody may change the list over the
-- API: the absence of insert/update/delete policies denies them.
create policy allowed_emails_select on public.allowed_emails
  for select using (public.is_member());

create policy profiles_select on public.profiles
  for select using (public.is_member());
create policy profiles_insert on public.profiles
  for insert with check (public.is_member());
create policy profiles_update on public.profiles
  for update using (public.is_member()) with check (public.is_member());
create policy profiles_delete on public.profiles
  for delete using (public.is_member());

create policy notes_select on public.notes
  for select using (public.is_member());
-- Members write notes only as themselves.
create policy notes_insert on public.notes
  for insert with check (public.is_member() and author = auth.uid());
-- And may revise only their own.
create policy notes_update on public.notes
  for update using (public.is_member() and author = auth.uid())
  with check (public.is_member() and author = auth.uid());
create policy notes_delete on public.notes
  for delete using (public.is_member() and author = auth.uid());
