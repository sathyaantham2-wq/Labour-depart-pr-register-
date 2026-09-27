-- Core schema (Roadmap Week 2). Source: Data Model tab of the v2 plan.
-- Notice tables (notices, notice_deliveries, notice_templates) come in Week 5.

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  full_name text not null default '',
  email text not null,
  active boolean not null default true, -- deactivate instead of delete
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'One row per signed-in user. Role admin = Head, staff = Officer.';

-- ---------------------------------------------------------------- lookups
create table public.sections (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (btrim(name) <> ''),
  created_at timestamptz not null default now()
);

create table public.received_from (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (btrim(name) <> ''),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- cases
create table public.cases (
  id uuid primary key default gen_random_uuid(),
  -- Single vs multi-office is an open decision. With one office every row keeps the
  -- default, so (office_code, file_number) behaves like a plain unique file_number.
  office_code text not null default 'MAIN',
  file_number text not null check (btrim(file_number) <> ''),
  act text not null check (btrim(act) <> ''), -- EC / ID / S&E / … (master list to be confirmed)
  section_id uuid references public.sections (id),
  received_from_id uuid references public.received_from (id),
  received_date date not null,
  next_hearing_date date, -- maintained by trigger from hearings
  status text not null default 'open' check (status in ('open', 'closed', 'forwarded')),
  forwarded_to text,
  closed_at date, -- maintained by trigger on status change
  subject text not null default '',
  memo_number text,
  amount_recovered numeric(14, 2) check (amount_recovered >= 0),
  assigned_officer_id uuid references public.profiles (id) default auth.uid(),
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz, -- soft delete; cases are never hard-deleted
  unique (office_code, file_number)
);
create index cases_assigned_officer_idx on public.cases (assigned_officer_id) where deleted_at is null;
create index cases_section_idx on public.cases (section_id);
create index cases_received_from_idx on public.cases (received_from_id);
create index cases_status_idx on public.cases (status) where deleted_at is null;
create index cases_next_hearing_idx on public.cases (next_hearing_date) where deleted_at is null;

-- ---------------------------------------------------------------- parties
create table public.parties (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  role text not null check (role in ('applicant', 'management')),
  name text not null check (btrim(name) <> ''),
  phone text[] not null default '{}',
  whatsapp_phone text check (whatsapp_phone ~ '^\+[1-9][0-9]{7,14}$'), -- E.164, e.g. +919876543210
  email text,
  address text,
  preferred_language text check (preferred_language in ('te', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index parties_case_idx on public.parties (case_id);

-- ---------------------------------------------------------------- hearings
create table public.hearings (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  hearing_date date not null,
  hearing_time time,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'held', 'adjourned', 'cancelled')),
  outcome_notes text,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index hearings_case_idx on public.hearings (case_id);
create index hearings_due_idx on public.hearings (hearing_date) where status = 'scheduled';

-- ---------------------------------------------------------------- remarks
create table public.remarks (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  date date not null default ((now() at time zone 'Asia/Kolkata')::date),
  text text not null check (btrim(text) <> ''),
  url text,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index remarks_case_idx on public.remarks (case_id);

-- ---------------------------------------------------------------- history & audit
create table public.case_status_history (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid references public.profiles (id),
  changed_at timestamptz not null default now(),
  note text
);
create index case_status_history_case_idx on public.case_status_history (case_id);

create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  changed_by uuid,
  changed_at timestamptz not null default now(),
  diff jsonb not null
);
create index audit_log_record_idx on public.audit_log (table_name, record_id);
create index audit_log_changed_at_idx on public.audit_log (changed_at);
