-- Documents attached to a Current Entry (complaint letters, settlement memos, scans).
--
-- Files live in a private Storage bucket that, like `notices`, has NO storage.objects policies:
-- only the server (service role) can write or mint links. The app checks access with the
-- caller's RLS-scoped client first, then:
--   * upload: mints a short-lived signed UPLOAD url so the browser sends the file straight to
--     Storage (keeps large scans off the 4.5 MB serverless request limit);
--   * download: mints a short-lived signed url for one object.
-- This table is the source of truth for which files belong to which entry, and its RLS is what
-- decides who may list / add / remove them.

create table public.case_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  file_name text not null check (btrim(file_name) <> '' and length(file_name) <= 255),
  storage_path text not null unique check (storage_path like 'cases/%'),
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  uploaded_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index case_documents_case_idx on public.case_documents (case_id, created_at desc);

alter table public.case_documents enable row level security;

-- Supabase grants anon full privileges on new tables by default; this office app has no
-- anonymous access anywhere. Documents are never edited in place (delete + re-upload).
revoke all on public.case_documents from anon;
revoke update on public.case_documents from authenticated;

create policy "case_documents: read" on public.case_documents
  for select to authenticated
  using (private.can_access_case(case_id));

create policy "case_documents: insert" on public.case_documents
  for insert to authenticated
  with check (private.can_access_case(case_id) and uploaded_by = (select auth.uid()));

-- Uploader (while they still have access to the entry) or an admin may remove a document.
create policy "case_documents: delete" on public.case_documents
  for delete to authenticated
  using ((select private.is_admin()) or (uploaded_by = (select auth.uid()) and private.can_access_case(case_id)));

create trigger case_documents_audit after insert or delete on public.case_documents
  for each row execute function public.audit_row();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'case-documents',
  'case-documents',
  false,
  20971520,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
  ]
)
on conflict (id) do nothing;
