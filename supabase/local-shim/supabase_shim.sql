-- LOCAL TESTING ONLY — never run this on a Supabase project.
-- Recreates the small part of Supabase that our migrations depend on, so they can be
-- applied and RLS-tested on a plain PostgreSQL install:
--   * roles anon / authenticated / service_role (cluster-wide, NOLOGIN)
--   * auth schema with auth.users and auth.uid()
--   * Supabase's default grants on the public schema

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Same definition as Supabase: reads the JWT subject set by PostgREST.
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- ---------------------------------------------------------------------- storage (minimal stand-in)
-- Week 5 needs a private bucket + RLS-gated storage.objects for the `notices` bucket. This is a
-- SIMPLIFICATION for local testing, not a faithful copy of Supabase Storage: no path_tokens,
-- versions, last_accessed_at, signed-URL machinery, etc. -- just enough shape for
-- `insert into storage.buckets`, `create policy ... on storage.objects`, and plain
-- insert/select against storage.objects to work the same way they would against a real project
-- (RLS-enabled, zero policies for a bucket -> deny-by-default for anon/authenticated,
-- service_role bypasses RLS via its bypassrls role attribute above).
create schema if not exists storage;
grant usage on schema storage to authenticated, service_role; -- anon: no access at all, like public

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;

grant select, insert, update, delete on storage.buckets, storage.objects to authenticated, service_role;
