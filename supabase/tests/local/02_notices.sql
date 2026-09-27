-- Week 5 (Notices & Documents) tests: notice_templates / notices / notice_deliveries RLS, the
-- notices.status roll-up trigger, the `notices` storage bucket, dashboard_stats and monthly_mis.
--
-- Each file under supabase/tests/local/ is run as its OWN `psql -f` invocation (see
-- scripts/db-local.mjs), so this file is self-contained: it (re)defines the same `tests` schema
-- helpers as 01_rls_and_triggers.sql, identically, rather than assuming they already exist.
-- Everything runs in one transaction and is rolled back.
-- Run: npm run db:local:test
\set ON_ERROR_STOP 1
begin;

-- ------------------------------------------------------------------ test helpers (same as 01)
create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

create function tests.ok(cond boolean, msg text) returns void
language plpgsql as $$
begin
  if cond is not true then
    raise exception 'FAIL: %', msg;
  end if;
  raise notice 'ok - %', msg;
end $$;

create function tests.rows(sql text) returns int
language plpgsql as $$
declare n int;
begin
  execute sql;
  get diagnostics n = row_count;
  return n;
end $$;

create function tests.denied(sql text, msg text) returns void
language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    raise notice 'ok - % (%)', msg, sqlerrm;
    return;
  end;
  raise exception 'FAIL: % — statement was allowed', msg;
end $$;

create function tests.login(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

-- ------------------------------------------------------------------ fixtures (as postgres)
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'admin2@test.local', '{"role":"admin"}', '{"full_name":"Head 2"}'),
  ('22222222-2222-2222-2222-222222222222', 'staffa2@test.local', '{}', '{"full_name":"Officer A2"}'),
  ('33333333-3333-3333-3333-333333333333', 'staffb2@test.local', '{}', '{"full_name":"Officer B2"}');

insert into public.cases (id, file_number, act, section_id, received_date, subject, status, assigned_officer_id, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'NTC-A/1/2026', 'EC', (select id from public.sections where name = 'JM'), current_date, 'Case A (notices)', 'open', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'NTC-B/1/2026', 'ID', (select id from public.sections where name = 'Administration'), current_date, 'Case B (notices)', 'open', '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333');

-- caseB closes today -> exercises the "closed" bucket of dashboard_stats/monthly_mis.
update public.cases set status = 'closed' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

insert into public.parties (id, case_id, role, name, whatsapp_phone, email) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'applicant', 'Applicant A', null, 'applicant.a@test.local'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'management', 'Management A', '+919876500001', null),
  ('b1111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'applicant', 'Applicant B', null, 'applicant.b@test.local');

insert into public.hearings (id, case_id, hearing_date) values
  ('0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_date + 7);

insert into public.notice_templates (id, name, notice_type, language, docx_path, active) values
  ('fe000000-0000-0000-0000-000000000001', 'Hearing Notice EN', 'hearing', 'en', 'templates/hearing_en.docx', true),
  ('fe000000-0000-0000-0000-000000000002', 'Hearing Notice TE (draft)', 'hearing', 'te', 'templates/hearing_te.docx', false);

-- notice2: created by the "batch" path (generated_by null), no deliveries yet -- exercises the
-- "zero delivery rows leaves status untouched" rule.
insert into public.notices (id, case_id, template_id, type, doc_path, generated_by, status) values
  ('0000000a-0000-0000-0000-00000000000b', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'fe000000-0000-0000-0000-000000000001', 'closure', 'cases/case-a/notice2.docx', null, 'pending');

-- ------------------------------------------------------------------ anon: nothing at all
set local role anon;
select tests.denied('select * from public.notice_templates', 'anon cannot read notice_templates');
select tests.denied('select * from public.notices', 'anon cannot read notices');
select tests.denied('select * from public.notice_deliveries', 'anon cannot read notice_deliveries');
select tests.denied('select * from storage.objects', 'anon cannot touch storage.objects at all');
reset role;

-- ------------------------------------------------------------------ notice_templates RLS
select tests.login('22222222-2222-2222-2222-222222222222'); -- staff A
select tests.ok((select count(*) from public.notice_templates) = 1, 'staff sees only active templates');
select tests.ok((select count(*) from public.notice_templates where id = 'fe000000-0000-0000-0000-000000000002') = 0,
                'staff cannot see the inactive draft template');
select tests.denied($$insert into public.notice_templates (name, notice_type, language, docx_path) values ('x','order','en','t.docx')$$,
                'staff cannot add a notice template');
-- Not a "with check" violation (the row is invisible to staff under the update policy's USING
-- clause in the first place), so this affects 0 rows rather than raising -- same pattern as
-- 01's "staff A cannot update B case".
select tests.ok(tests.rows($$update public.notice_templates set active = false where id = 'fe000000-0000-0000-0000-000000000001'$$) = 0,
                'staff cannot edit a notice template');
select tests.ok(tests.rows($$delete from public.notice_templates where id = 'fe000000-0000-0000-0000-000000000001'$$) = 0,
                'staff cannot delete a notice template');
reset role;

select tests.login('11111111-1111-1111-1111-111111111111'); -- admin
select tests.ok((select count(*) from public.notice_templates) = 2, 'admin sees active and inactive templates');
select tests.ok(tests.rows($$insert into public.notice_templates (name, notice_type, language, docx_path) values ('Order Notice EN','order','en','templates/order_en.docx')$$) = 1,
                'admin can add a notice template');
select tests.ok(tests.rows($$update public.notice_templates set active = true where id = 'fe000000-0000-0000-0000-000000000002'$$) = 1,
                'admin can edit a notice template');
reset role;

-- ------------------------------------------------------------------ notices RLS (insert/read)
select tests.login('22222222-2222-2222-2222-222222222222'); -- staff A
select tests.denied($$insert into public.notices (case_id, template_id, type, doc_path, generated_by, idempotency_key)
                     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'fe000000-0000-0000-0000-000000000001', 'hearing', 'cases/case-b/x.docx', '22222222-2222-2222-2222-222222222222', 'sneaky')$$,
                'staff A cannot create a notice on case B');
select tests.ok(tests.rows($$insert into public.notices (id, case_id, hearing_id, template_id, type, doc_path, generated_by, idempotency_key)
                     values ('0000000a-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a', 'fe000000-0000-0000-0000-000000000001', 'hearing', 'cases/case-a/notice1.docx', '22222222-2222-2222-2222-222222222222', 'hearingA:hearing')$$) = 1,
                'staff A creates a notice for own case');
select tests.denied($$insert into public.notices (case_id, template_id, type, doc_path, idempotency_key)
                     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'fe000000-0000-0000-0000-000000000001', 'hearing', 'cases/case-a/dup.docx', 'hearingA:hearing')$$,
                'idempotency_key must be unique');
select tests.ok((select count(*) from public.notices) = 2, 'staff A sees notice1 + notice2 (both case A)');
select tests.denied($$update public.notices set status = 'sent' where id = '0000000a-0000-0000-0000-00000000000a'$$,
                'staff cannot set notices.status directly (trigger-maintained only)');
reset role;

select tests.login('33333333-3333-3333-3333-333333333333'); -- staff B
select tests.ok(tests.rows($$insert into public.notices (id, case_id, template_id, type, doc_path, generated_by, idempotency_key)
                     values ('0000000b-0000-0000-0000-00000000000a', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'fe000000-0000-0000-0000-000000000001', 'hearing', 'cases/case-b/notice1.docx', '33333333-3333-3333-3333-333333333333', 'caseB:hearing')$$) = 1,
                'staff B creates a notice for own case');
select tests.ok((select count(*) from public.notices) = 1, 'staff B sees only own notice');
reset role;

select tests.login('11111111-1111-1111-1111-111111111111'); -- admin
select tests.ok((select count(*) from public.notices) = 3, 'admin sees all notices');
select tests.denied($$update public.notices set status = 'sent' where id = '0000000a-0000-0000-0000-00000000000a'$$,
                'even admin cannot set notices.status directly (no update policy at all)');
reset role;

-- ------------------------------------------------------------------ notice_deliveries: writes are service_role only
select tests.login('22222222-2222-2222-2222-222222222222'); -- staff A
select tests.denied($$insert into public.notice_deliveries (notice_id, party_id, channel, recipient)
                     values ('0000000a-0000-0000-0000-00000000000a', 'a1111111-1111-1111-1111-111111111111', 'email', 'applicant.a@test.local')$$,
                'staff cannot insert notice_deliveries directly (service_role only)');
reset role;

select tests.login('11111111-1111-1111-1111-111111111111'); -- admin
select tests.denied($$insert into public.notice_deliveries (notice_id, party_id, channel, recipient)
                     values ('0000000a-0000-0000-0000-00000000000a', 'a1111111-1111-1111-1111-111111111111', 'email', 'applicant.a@test.local')$$,
                'even admin cannot insert notice_deliveries directly (service_role only)');
reset role;

-- ------------------------------------------------------------------ status roll-up trigger (as service_role)
set local role service_role;
insert into public.notice_deliveries (id, notice_id, party_id, channel, recipient) values
  ('d0000001-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-00000000000a', 'a1111111-1111-1111-1111-111111111111', 'email', 'applicant.a@test.local'),
  ('d0000001-0000-0000-0000-000000000002', '0000000a-0000-0000-0000-00000000000a', 'a2222222-2222-2222-2222-222222222222', 'whatsapp', '+919876500001');
reset role;

select tests.ok((select status from public.notices where id = '0000000a-0000-0000-0000-00000000000a') = 'pending',
                'notice status stays pending while any delivery is pending');

set local role service_role;
update public.notice_deliveries set status = 'sent', sent_at = now() where id = 'd0000001-0000-0000-0000-000000000001';
reset role;
select tests.ok((select status from public.notices where id = '0000000a-0000-0000-0000-00000000000a') = 'pending',
                'one sent + one still pending -> notice still pending');

set local role service_role;
update public.notice_deliveries set status = 'delivered', sent_at = now() where id = 'd0000001-0000-0000-0000-000000000002';
reset role;
select tests.ok((select status from public.notices where id = '0000000a-0000-0000-0000-00000000000a') = 'sent',
                'all deliveries sent/delivered/read -> notice status sent');

set local role service_role;
update public.notice_deliveries set status = 'failed', error = 'bounced' where id = 'd0000001-0000-0000-0000-000000000001';
reset role;
select tests.ok((select status from public.notices where id = '0000000a-0000-0000-0000-00000000000a') = 'partial',
                'a mix of sent and failed (no pending) -> notice status partial');

set local role service_role;
update public.notice_deliveries set status = 'failed', error = 'not on whatsapp' where id = 'd0000001-0000-0000-0000-000000000002';
reset role;
select tests.ok((select status from public.notices where id = '0000000a-0000-0000-0000-00000000000a') = 'failed',
                'all deliveries failed -> notice status failed');

select tests.ok((select status from public.notices where id = '0000000a-0000-0000-0000-00000000000b') = 'pending',
                'a notice with zero delivery rows keeps its existing status');

-- ------------------------------------------------------------------ notice_deliveries RLS (read)
select tests.login('22222222-2222-2222-2222-222222222222'); -- staff A
select tests.ok((select count(*) from public.notice_deliveries) = 2, 'staff A reads deliveries of own-case notices');
reset role;

select tests.login('33333333-3333-3333-3333-333333333333'); -- staff B
select tests.ok((select count(*) from public.notice_deliveries) = 0, 'staff B sees no deliveries (none on own case)');
reset role;

select tests.login('11111111-1111-1111-1111-111111111111'); -- admin
select tests.ok((select count(*) from public.notice_deliveries) = 2, 'admin sees all deliveries');
reset role;

-- ------------------------------------------------------------------ storage: notices bucket, service_role only
set local role service_role;
select tests.ok(tests.rows($$insert into storage.objects (bucket_id, name) values ('notices', 'cases/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/0000000a-0000-0000-0000-00000000000a.docx')$$) = 1,
                'service_role can write into the notices bucket (bypasses RLS)');
reset role;

select tests.login('22222222-2222-2222-2222-222222222222'); -- staff A
select tests.denied($$insert into storage.objects (bucket_id, name) values ('notices', 'cases/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/sneaky.docx')$$,
                'authenticated cannot write to the notices bucket directly (no policy)');
select tests.ok((select count(*) from storage.objects) = 0,
                'authenticated cannot see any object in the notices bucket either (no select policy, RLS denies by default)');
reset role;

-- ------------------------------------------------------------------ dashboard_stats
select tests.login('22222222-2222-2222-2222-222222222222'); -- staff A
select tests.ok((select count(*) from public.dashboard_stats) = 1, 'staff A sees exactly one act/section row (own case only)');
select tests.ok((select total from public.dashboard_stats where act = 'EC') = 1, 'staff A total for EC = 1');
select tests.ok((select open from public.dashboard_stats where act = 'EC') = 1, 'staff A open for EC = 1');
reset role;

select tests.login('33333333-3333-3333-3333-333333333333'); -- staff B
select tests.ok((select closed from public.dashboard_stats where act = 'ID') = 1, 'staff B sees case B counted as closed');
select tests.ok((select open from public.dashboard_stats where act = 'ID') = 0, 'staff B sees case B not counted as open');
reset role;

select tests.login('11111111-1111-1111-1111-111111111111'); -- admin
select tests.ok((select sum(total) from public.dashboard_stats where act in ('EC', 'ID')) = 2,
                'admin sees both act rows summing to both fixture cases');
reset role;

-- ------------------------------------------------------------------ monthly_mis (admin-only, open decision default)
select tests.login('22222222-2222-2222-2222-222222222222'); -- staff A
select tests.denied('select * from public.monthly_mis()',
                'staff cannot call monthly_mis -- default is admin-only (see report: this is still an OPEN DECISION)');
reset role;

select tests.login('11111111-1111-1111-1111-111111111111'); -- admin
select tests.ok(
  (select received from public.monthly_mis()
    where section_name = 'JM' and month = date_trunc('month', current_date)::date) = 1,
  'monthly_mis: JM received = 1 this month (case A)');
select tests.ok(
  (select carried_forward from public.monthly_mis()
    where section_name = 'JM' and month = date_trunc('month', current_date)::date) = 1,
  'monthly_mis: JM carried_forward = 1 this month (case A still open)');
select tests.ok(
  (select received from public.monthly_mis()
    where section_name = 'Administration' and month = date_trunc('month', current_date)::date) = 1,
  'monthly_mis: Administration received = 1 this month (case B)');
select tests.ok(
  (select closed from public.monthly_mis()
    where section_name = 'Administration' and month = date_trunc('month', current_date)::date) = 1,
  'monthly_mis: Administration closed = 1 this month (case B closed today)');
select tests.ok(
  (select carried_forward from public.monthly_mis()
    where section_name = 'Administration' and month = date_trunc('month', current_date)::date) = 0,
  'monthly_mis: Administration carried_forward = 0 (case B received and closed same month)');
reset role;

\echo 'All notices/documents tests passed.'
rollback;
