-- Final pre-production QA pass: DELETE-specific RLS coverage that 01_rls_and_triggers.sql and
-- 02_notices.sql don't exercise. Both existing files cover SELECT/UPDATE/INSERT cross-staff
-- boundaries thoroughly, and cases' hard-delete is tested, but nobody had asserted the DELETE
-- policies on parties/hearings/remarks/notices/notice_deliveries/case_status_history/audit_log
-- actually behave as documented:
--   - parties/remarks: staff can delete rows on their OWN case, but not on someone else's case
--     (same public.can_access_case(case_id) policy as read/update/insert, but DELETE was never
--     independently checked).
--   - hearings: staff have NO delete policy at all (they cancel instead) -- not even on their own
--     case. Only admin can hard-delete a hearing. This is a stricter rule than parties/remarks and
--     was previously untested in either direction.
--   - notices / notice_deliveries / case_status_history / audit_log: DELETE is revoked from
--     `authenticated` entirely (see 20260927100200_rls.sql and 20260927100600_notices_rls.sql) --
--     not even admin can delete these rows. Only the "cannot set status directly" / "cannot
--     insert directly" angle was tested before; the delete revoke was assumed correct via code
--     reading but never actually run.
--
-- Each file under supabase/tests/local/ is run as its OWN `psql -f` invocation (see
-- scripts/db-local.mjs), so this file is self-contained: it (re)defines the same `tests` schema
-- helpers as 01_rls_and_triggers.sql / 02_notices.sql, identically, rather than assuming they
-- already exist. Everything runs in one transaction and is rolled back.
-- Run: npm run db:local:test
\set ON_ERROR_STOP 1
begin;

-- ------------------------------------------------------------------ test helpers (same as 01/02)
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
  ('44444444-4444-4444-4444-444444444444', 'admin3@test.local', '{"role":"admin"}', '{"full_name":"Head 3"}'),
  ('55555555-5555-5555-5555-555555555555', 'staffa3@test.local', '{}', '{"full_name":"Officer A3"}'),
  ('66666666-6666-6666-6666-666666666666', 'staffb3@test.local', '{}', '{"full_name":"Officer B3"}');

insert into public.cases (id, file_number, act, received_date, subject, status, assigned_officer_id, created_by) values
  ('c1111111-cccc-cccc-cccc-cccccccccccc', 'DEL-A/1/2026', 'EC', current_date, 'Case A (delete tests)', 'open', '55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555'),
  ('c2222222-cccc-cccc-cccc-cccccccccccc', 'DEL-B/1/2026', 'ID', current_date, 'Case B (delete tests)', 'open', '66666666-6666-6666-6666-666666666666', '66666666-6666-6666-6666-666666666666');

insert into public.parties (id, case_id, role, name) values
  ('d1111111-dddd-dddd-dddd-dddddddddddd', 'c1111111-cccc-cccc-cccc-cccccccccccc', 'applicant', 'Worker A (delete test)'),
  ('d2222222-dddd-dddd-dddd-dddddddddddd', 'c1111111-cccc-cccc-cccc-cccccccccccc', 'management', 'Employer A (delete test)'),
  ('d3333333-dddd-dddd-dddd-dddddddddddd', 'c2222222-cccc-cccc-cccc-cccccccccccc', 'applicant', 'Worker B (delete test)');

insert into public.remarks (id, case_id, text) values
  ('e1111111-eeee-eeee-eeee-eeeeeeeeeeee', 'c1111111-cccc-cccc-cccc-cccccccccccc', 'Remark on A (delete test)'),
  ('e2222222-eeee-eeee-eeee-eeeeeeeeeeee', 'c2222222-cccc-cccc-cccc-cccccccccccc', 'Remark on B (delete test)');

insert into public.hearings (id, case_id, hearing_date) values
  ('f1111111-ffff-ffff-ffff-ffffffffffff', 'c1111111-cccc-cccc-cccc-cccccccccccc', current_date + 5),
  ('f2222222-ffff-ffff-ffff-ffffffffffff', 'c2222222-cccc-cccc-cccc-cccccccccccc', current_date + 6);

insert into public.notice_templates (id, name, notice_type, language, docx_path, active) values
  ('a0000000-0000-0000-0000-000000000001', 'Hearing Notice EN (delete test)', 'hearing', 'en', 'templates/hearing_en.docx', true);

insert into public.notices (id, case_id, template_id, type, doc_path, generated_by, status) values
  ('a0000000-0000-0000-0000-00000000000a', 'c1111111-cccc-cccc-cccc-cccccccccccc', 'a0000000-0000-0000-0000-000000000001', 'hearing', 'cases/del-a/notice.docx', '55555555-5555-5555-5555-555555555555', 'pending');

insert into public.notice_deliveries (id, notice_id, party_id, channel, recipient, status) values
  ('a0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a', 'd1111111-dddd-dddd-dddd-dddddddddddd', 'whatsapp', '+919876543210', 'pending');

-- ------------------------------------------------------------------ staff A: cross-staff DELETE denials
select tests.login('55555555-5555-5555-5555-555555555555'); -- staff A, owns case c1111111...

select tests.ok(tests.rows($$delete from public.parties where id = 'd3333333-dddd-dddd-dddd-dddddddddddd'$$) = 0,
                'staff A cannot delete staff B''s party');
select tests.ok(tests.rows($$delete from public.remarks where id = 'e2222222-eeee-eeee-eeee-eeeeeeeeeeee'$$) = 0,
                'staff A cannot delete staff B''s remark');

-- ------------------------------------------------------------------ staff A: hearings are admin-only to delete,
-- even on staff A's own case (staff cancel a hearing instead of deleting it).
select tests.ok(tests.rows($$delete from public.hearings where id = 'f1111111-ffff-ffff-ffff-ffffffffffff'$$) = 0,
                'staff A cannot delete a hearing even on their own case');
select tests.ok(tests.rows($$delete from public.hearings where id = 'f2222222-ffff-ffff-ffff-ffffffffffff'$$) = 0,
                'staff A cannot delete staff B''s hearing either');

-- ------------------------------------------------------------------ staff A: notices/notice_deliveries/
-- case_status_history/audit_log DELETE is revoked entirely -- not row-filtered, actually absent as a grant.
select tests.denied($$delete from public.notices where id = 'a0000000-0000-0000-0000-00000000000a'$$,
                'staff A cannot delete their own notice (no delete policy at all)');
select tests.denied($$delete from public.notice_deliveries where id = 'a0000000-0000-0000-0000-00000000000b'$$,
                'staff A cannot delete a notice_deliveries row');
select tests.denied($$delete from public.case_status_history where case_id = 'c1111111-cccc-cccc-cccc-cccccccccccc'$$,
                'staff A cannot delete case_status_history');
select tests.denied($$delete from public.audit_log$$,
                'staff A cannot delete audit_log');

-- ------------------------------------------------------------------ staff A: positive control -- the delete
-- policy on parties/remarks isn't just a blanket deny; it genuinely allows deleting rows on a case
-- staff A does have access to, so the denials above are proof of the case_id scoping, not of a
-- broken/missing policy that would deny everyone including the owner.
select tests.ok(tests.rows($$delete from public.parties where id = 'd2222222-dddd-dddd-dddd-dddddddddddd'$$) = 1,
                'staff A CAN delete a party on their own case');
select tests.ok(tests.rows($$delete from public.remarks where id = 'e1111111-eeee-eeee-eeee-eeeeeeeeeeee'$$) = 1,
                'staff A CAN delete a remark on their own case');
reset role;

-- ------------------------------------------------------------------ admin
select tests.login('44444444-4444-4444-4444-444444444444');

select tests.ok(tests.rows($$delete from public.hearings where id = 'f2222222-ffff-ffff-ffff-ffffffffffff'$$) = 1,
                'admin CAN delete a hearing');
select tests.denied($$delete from public.notices where id = 'a0000000-0000-0000-0000-00000000000a'$$,
                'even admin cannot delete a notice (delete revoked for everyone, not just staff)');
select tests.denied($$delete from public.notice_deliveries where id = 'a0000000-0000-0000-0000-00000000000b'$$,
                'even admin cannot delete a notice_deliveries row');
select tests.denied($$delete from public.case_status_history where case_id = 'c1111111-cccc-cccc-cccc-cccccccccccc'$$,
                'even admin cannot delete case_status_history');
select tests.denied($$delete from public.audit_log$$,
                'even admin cannot delete audit_log');
-- Admin can delete another officer's party/remark too (admin bypasses can_access_case's ownership
-- check entirely via is_admin()) -- confirms admin's "everything" access extends to DELETE, not
-- just SELECT/UPDATE which are the only ones 01/02 checked for admin.
select tests.ok(tests.rows($$delete from public.parties where id = 'd3333333-dddd-dddd-dddd-dddddddddddd'$$) = 1,
                'admin CAN delete staff B''s party');
select tests.ok(tests.rows($$delete from public.remarks where id = 'e2222222-eeee-eeee-eeee-eeeeeeeeeeee'$$) = 1,
                'admin CAN delete staff B''s remark');
reset role;

\echo 'All DELETE RLS gap tests passed.'
rollback;
