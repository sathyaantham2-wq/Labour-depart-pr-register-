-- Week 5: RLS for notice_templates, notices, notice_deliveries.
-- Same helpers as 20260927100200_rls.sql, now living in `private`
-- (private.is_admin / private.is_active_user / private.can_access_case).

alter table public.notice_templates enable row level security;
alter table public.notices enable row level security;
alter table public.notice_deliveries enable row level security;

-- Supabase's default privileges auto-grant anon full table access on every new table in
-- `public` (mirrored by the local shim); the core RLS migration revoked that for tables that
-- existed at the time, so we revoke it again for these three new ones.
revoke all on public.notice_templates, public.notices, public.notice_deliveries from anon;

-- ---------------------------------------------------------------- notice_templates
-- Same pattern as sections/received_from: any active signed-in user reads; only admin writes.
-- Admin can also see inactive templates (needed to manage/reactivate them).
create policy "notice_templates: read active or admin" on public.notice_templates
  for select to authenticated
  using ((select private.is_admin()) or (active and (select private.is_active_user())));
create policy "notice_templates: admin inserts" on public.notice_templates
  for insert to authenticated with check ((select private.is_admin()));
create policy "notice_templates: admin updates" on public.notice_templates
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "notice_templates: admin deletes" on public.notice_templates
  for delete to authenticated using ((select private.is_admin()));

-- ---------------------------------------------------------------- notices
-- Same access as the parent case. No update/delete policy for anyone (including admin): status
-- is trigger-maintained from notice_deliveries only, and a re-generated notice is a new row.
create policy "notices: read via case access" on public.notices
  for select to authenticated using (private.can_access_case(case_id));
create policy "notices: insert via case access" on public.notices
  for insert to authenticated with check (private.can_access_case(case_id));
revoke update, delete on public.notices from authenticated;

-- ---------------------------------------------------------------- notice_deliveries
-- Read-only for authenticated users, scoped through the parent notice's case (staff/admin
-- viewing notice history). Writes come only from the notice-generation API route and the
-- Make.com callback route, both using the service_role key, which bypasses RLS entirely --
-- so no authenticated-role write policy is needed or added here.
create policy "notice_deliveries: read via case access" on public.notice_deliveries
  for select to authenticated using (
    exists (
      select 1
        from public.notices n
       where n.id = notice_id
         and private.can_access_case(n.case_id)
    )
  );
revoke insert, update, delete on public.notice_deliveries from authenticated;
