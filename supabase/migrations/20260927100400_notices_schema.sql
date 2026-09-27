-- Week 5 (Notices & Documents): notice_templates, notices, notice_deliveries.
-- Source: Data Model tab (v2). Everything up to and including 20260927100301 is already
-- applied to the Supabase project; this and later files are new.

-- ---------------------------------------------------------------- notice_templates
create table public.notice_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  notice_type text not null check (notice_type in ('hearing', 'show_cause', 'closure', 'order')),
  language text not null check (language in ('te', 'en')),
  docx_path text not null check (btrim(docx_path) <> ''), -- Storage path of the DOCX template
  whatsapp_template_name text, -- Meta-approved template name; nullable until WhatsApp is wired up
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.notice_templates is
  'DOCX letterhead templates per notice type + language. Managed by admin only.';
create index notice_templates_type_lang_idx on public.notice_templates (notice_type, language)
  where active;

-- ---------------------------------------------------------------- notices
create table public.notices (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  hearing_id uuid references public.hearings (id) on delete set null,
  template_id uuid not null references public.notice_templates (id),
  type text not null check (type in ('hearing', 'show_cause', 'closure', 'order')),
  doc_path text not null check (btrim(doc_path) <> ''), -- private Storage path, NOT a public URL
  generated_at timestamptz not null default now(),
  generated_by uuid references public.profiles (id) on delete set null, -- null = batch/automation
  status text not null default 'pending' check (status in ('pending', 'partial', 'sent', 'failed')),
  idempotency_key text unique, -- e.g. hearing_id::text || ':' || type
  created_at timestamptz not null default now()
);
comment on column public.notices.status is
  'Rolled up from notice_deliveries by a trigger (see notices_triggers migration); never set directly.';
create index notices_case_idx on public.notices (case_id);
create index notices_hearing_idx on public.notices (hearing_id);
create index notices_status_idx on public.notices (status);

-- ---------------------------------------------------------------- notice_deliveries
create table public.notice_deliveries (
  id uuid primary key default gen_random_uuid(),
  notice_id uuid not null references public.notices (id) on delete cascade,
  party_id uuid not null references public.parties (id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp')),
  recipient text not null check (btrim(recipient) <> ''), -- the actual email/phone used
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'delivered', 'read', 'failed')),
  provider_message_id text,
  error text,
  attempt_count int not null default 0 check (attempt_count >= 0),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (notice_id, party_id, channel)
);
create index notice_deliveries_notice_idx on public.notice_deliveries (notice_id);
create index notice_deliveries_party_idx on public.notice_deliveries (party_id);
create index notice_deliveries_retry_idx on public.notice_deliveries (status) where status = 'failed';
