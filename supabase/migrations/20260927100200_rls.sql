-- Row Level Security (RBAC Matrix tab).
--   admin : everything (cases are soft-deleted, never hard-deleted)
--   staff : only cases assigned to them, and those cases' child rows
--   anon  : nothing
-- Deactivated users (profiles.active = false) get nothing.

-- ---------------------------------------------------------------- helpers
-- security definer so policies can read profiles/cases without recursive RLS checks.
create function public.is_active_user() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.active
  );
$$;

create function public.is_admin() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.active and p.role = 'admin'
  );
$$;

create function public.can_access_case(p_case_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_admin()
      or exists (
           select 1
             from public.cases c
             join public.profiles p on p.id = c.assigned_officer_id
            where c.id = p_case_id
              and c.deleted_at is null
              and p.id = auth.uid()
              and p.active
         );
$$;

revoke execute on function public.is_active_user() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.can_access_case(uuid) from public, anon;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_access_case(uuid) to authenticated;

-- ---------------------------------------------------------------- enable RLS everywhere
alter table public.profiles enable row level security;
alter table public.sections enable row level security;
alter table public.received_from enable row level security;
alter table public.cases enable row level security;
alter table public.parties enable row level security;
alter table public.hearings enable row level security;
alter table public.remarks enable row level security;
alter table public.case_status_history enable row level security;
alter table public.audit_log enable row level security;

-- ---------------------------------------------------------------- profiles
-- Everyone active can see the officer list (names on case lists); only admin edits.
-- Rows are created by the auth.users trigger, never inserted directly.
create policy "profiles: active users read" on public.profiles
  for select to authenticated using ((select public.is_active_user()));
create policy "profiles: admin updates" on public.profiles
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------- lookups
create policy "sections: active users read" on public.sections
  for select to authenticated using ((select public.is_active_user()));
create policy "sections: admin inserts" on public.sections
  for insert to authenticated with check ((select public.is_admin()));
create policy "sections: admin updates" on public.sections
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "sections: admin deletes" on public.sections
  for delete to authenticated using ((select public.is_admin()));

create policy "received_from: active users read" on public.received_from
  for select to authenticated using ((select public.is_active_user()));
create policy "received_from: admin inserts" on public.received_from
  for insert to authenticated with check ((select public.is_admin()));
create policy "received_from: admin updates" on public.received_from
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "received_from: admin deletes" on public.received_from
  for delete to authenticated using ((select public.is_admin()));

-- ---------------------------------------------------------------- cases
-- Admin also sees soft-deleted cases (for restore); staff never do.
create policy "cases: read own or all for admin" on public.cases
  for select to authenticated
  using (
    (select public.is_admin())
    or (assigned_officer_id = (select auth.uid()) and deleted_at is null
        and (select public.is_active_user()))
  );

-- Staff can only create cases assigned to themselves.
create policy "cases: create" on public.cases
  for insert to authenticated
  with check (
    (select public.is_admin())
    or (assigned_officer_id = (select auth.uid()) and deleted_at is null
        and (select public.is_active_user()))
  );

-- Staff cannot reassign a case to someone else or soft-delete it.
create policy "cases: update own or all for admin" on public.cases
  for update to authenticated
  using (
    (select public.is_admin())
    or (assigned_officer_id = (select auth.uid()) and deleted_at is null
        and (select public.is_active_user()))
  )
  with check (
    (select public.is_admin())
    or (assigned_officer_id = (select auth.uid()) and deleted_at is null)
  );
-- No delete policy: cases are soft-deleted via deleted_at (admin only).

-- ---------------------------------------------------------------- case child tables
create policy "parties: read" on public.parties
  for select to authenticated using (public.can_access_case(case_id));
create policy "parties: insert" on public.parties
  for insert to authenticated with check (public.can_access_case(case_id));
create policy "parties: update" on public.parties
  for update to authenticated
  using (public.can_access_case(case_id))
  with check (public.can_access_case(case_id));
create policy "parties: delete" on public.parties
  for delete to authenticated using (public.can_access_case(case_id));

create policy "hearings: read" on public.hearings
  for select to authenticated using (public.can_access_case(case_id));
create policy "hearings: insert" on public.hearings
  for insert to authenticated with check (public.can_access_case(case_id));
create policy "hearings: update" on public.hearings
  for update to authenticated
  using (public.can_access_case(case_id))
  with check (public.can_access_case(case_id));
-- Staff cancel hearings (status = cancelled) rather than delete them.
create policy "hearings: admin deletes" on public.hearings
  for delete to authenticated using ((select public.is_admin()));

create policy "remarks: read" on public.remarks
  for select to authenticated using (public.can_access_case(case_id));
create policy "remarks: insert" on public.remarks
  for insert to authenticated with check (public.can_access_case(case_id));
create policy "remarks: update" on public.remarks
  for update to authenticated
  using (public.can_access_case(case_id))
  with check (public.can_access_case(case_id));
create policy "remarks: delete" on public.remarks
  for delete to authenticated using (public.can_access_case(case_id));

-- Written only by triggers.
create policy "case_status_history: read" on public.case_status_history
  for select to authenticated using (public.can_access_case(case_id));

create policy "audit_log: admin reads" on public.audit_log
  for select to authenticated using ((select public.is_admin()));

-- ---------------------------------------------------------------- privileges
-- Supabase grants anon full table privileges by default; RLS already blocks it, but
-- remove them too so a missing policy can never expose data to signed-out visitors.
revoke all on all tables in schema public from anon;
revoke insert, update, delete on public.case_status_history, public.audit_log from authenticated;
