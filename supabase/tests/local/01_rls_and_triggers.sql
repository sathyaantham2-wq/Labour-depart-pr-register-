-- RLS + trigger tests for plain PostgreSQL (pgTAP is not installed locally).
-- Everything runs in one transaction and is rolled back.
-- Run: npm run db:local:test
\set ON_ERROR_STOP 1
begin;

-- ------------------------------------------------------------------ test helpers
create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.ok(cond boolean, msg text) returns void
language plpgsql as $$
begin
  if cond is not true then
    raise exception 'FAIL: %', msg;
  end if;
  raise notice 'ok - %', msg;
end $$;

-- Runs a statement; returns the number of rows it affected.
create function tests.rows(sql text) returns int
language plpgsql as $$
declare n int;
begin
  execute sql;
  get diagnostics n = row_count;
  return n;
end $$;

-- Passes if the statement raises an error (RLS violation / permission denied / check).
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

-- Switch the current "signed-in" user for the rest of the transaction.
create function tests.login(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

grant execute on all functions in schema tests to anon, authenticated;

-- ------------------------------------------------------------------ fixtures (as postgres)
-- Users: admin, staff A, staff B (tries to self-promote via user_metadata), staff C (deactivated)
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local', '{"role":"admin"}', '{"full_name":"Head"}'),
  ('00000000-0000-0000-0000-0000000000a1', 'a@test.local', '{}', '{"full_name":"Officer A"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'b@test.local', '{}', '{"full_name":"Officer B","role":"admin"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'c@test.local', '{}', '{}');

insert into public.cases (id, file_number, act, received_date, subject, assigned_officer_id, created_by) values
  ('10000000-0000-0000-0000-0000000000a1', 'A/1/2026', 'EC', '2026-09-01', 'Case of A', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-0000000000b1', 'B/1/2026', 'ID', '2026-09-02', 'Case of B', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1'),
  ('10000000-0000-0000-0000-0000000000c1', 'C/1/2026', 'EC', '2026-09-03', 'Case of C', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1');

insert into public.parties (case_id, role, name, whatsapp_phone) values
  ('10000000-0000-0000-0000-0000000000a1', 'applicant', 'Worker A', '+919876543210'),
  ('10000000-0000-0000-0000-0000000000a1', 'management', 'Employer A', null),
  ('10000000-0000-0000-0000-0000000000b1', 'applicant', 'Worker B', null);

insert into public.hearings (case_id, hearing_date) values
  ('10000000-0000-0000-0000-0000000000b1', current_date + 10);

insert into public.remarks (case_id, text) values
  ('10000000-0000-0000-0000-0000000000a1', 'Remark on A'),
  ('10000000-0000-0000-0000-0000000000b1', 'Remark on B');

update public.profiles set active = false where id = '00000000-0000-0000-0000-0000000000c1';

-- ------------------------------------------------------------------ profiles from auth.users
select tests.ok((select role from public.profiles where email = 'admin@test.local') = 'admin',
                'admin role taken from app_metadata');
select tests.ok((select role from public.profiles where email = 'b@test.local') = 'staff',
                'role in user_metadata is ignored (no self-promotion)');
select tests.ok((select full_name from public.profiles where email = 'a@test.local') = 'Officer A',
                'full_name copied from user_metadata');

-- ------------------------------------------------------------------ anon
set local role anon;
select tests.denied('select * from public.cases', 'anon cannot read cases');
select tests.denied('select * from public.profiles', 'anon cannot read profiles');
select tests.denied('select * from public.sections', 'anon cannot read sections');
reset role;

-- ------------------------------------------------------------------ staff A
select tests.login('00000000-0000-0000-0000-0000000000a1');

select tests.ok((select count(*) from public.cases) = 1, 'staff A sees only own case');
select tests.ok((select file_number from public.cases) = 'A/1/2026', 'staff A sees case A');
select tests.ok((select count(*) from public.parties) = 2, 'staff A sees only own case parties');
select tests.ok((select count(*) from public.hearings) = 0, 'staff A cannot see B hearings');
select tests.ok((select count(*) from public.remarks) = 1, 'staff A sees only own remarks');
select tests.ok((select count(*) from public.case_status_history) = 1, 'staff A sees only own status history');
select tests.ok((select count(*) from public.audit_log) = 0, 'staff cannot read audit log');
select tests.ok((select count(*) from public.sections) >= 2, 'staff can read sections');
select tests.ok((select count(*) from public.profiles) = 4, 'staff can read officer list');

select tests.ok(tests.rows($$update public.cases set subject = 'hacked' where file_number = 'B/1/2026'$$) = 0,
                'staff A cannot update B case');
select tests.ok(tests.rows($$update public.parties set name = 'x' where name = 'Worker B'$$) = 0,
                'staff A cannot update B parties');
select tests.ok(tests.rows($$update public.cases set subject = 'Updated by A' where file_number = 'A/1/2026'$$) = 1,
                'staff A can update own case');
select tests.denied($$update public.cases set assigned_officer_id = '00000000-0000-0000-0000-0000000000b1' where file_number = 'A/1/2026'$$,
                'staff A cannot reassign own case');
select tests.denied($$update public.cases set deleted_at = now() where file_number = 'A/1/2026'$$,
                'staff A cannot soft-delete');
select tests.ok(tests.rows($$delete from public.cases where file_number = 'A/1/2026'$$) = 0,
                'nobody can hard-delete a case (staff)');
select tests.denied($$insert into public.cases (file_number, act, received_date, assigned_officer_id)
                     values ('X/1', 'EC', current_date, '00000000-0000-0000-0000-0000000000b1')$$,
                'staff A cannot create a case for B');
select tests.ok(tests.rows($$insert into public.cases (file_number, act, received_date) values ('A/2/2026', 'EC', current_date)$$) = 1,
                'staff A creates a case (auto-assigned)');
select tests.ok((select count(*) from public.cases) = 2, 'new case visible to its creator');
select tests.denied($$insert into public.parties (case_id, role, name) values ('10000000-0000-0000-0000-0000000000b1', 'applicant', 'Sneaky')$$,
                'staff A cannot add a party to B case');
select tests.denied($$insert into public.remarks (case_id, text) values ('10000000-0000-0000-0000-0000000000b1', 'x')$$,
                'staff A cannot add a remark to B case');
select tests.denied($$insert into public.sections (name) values ('Staff section')$$,
                'staff cannot add sections');
select tests.ok(tests.rows($$update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a1'$$) = 0,
                'staff cannot promote themselves');
select tests.denied($$insert into public.audit_log (table_name, action, diff) values ('x', 'insert', '{}')$$,
                'staff cannot write audit log');
select tests.denied($$insert into public.case_status_history (case_id, to_status) values ('10000000-0000-0000-0000-0000000000a1', 'closed')$$,
                'staff cannot write status history directly');
reset role;

-- ------------------------------------------------------------------ deactivated staff C
select tests.login('00000000-0000-0000-0000-0000000000c1');
select tests.ok((select count(*) from public.cases) = 0, 'deactivated staff sees no cases');
select tests.ok((select count(*) from public.profiles) = 0, 'deactivated staff sees no profiles');
reset role;

-- ------------------------------------------------------------------ admin
select tests.login('00000000-0000-0000-0000-00000000000a');
select tests.ok((select count(*) from public.cases) = 4, 'admin sees all cases');
select tests.ok((select count(*) from public.hearings) = 1, 'admin sees all hearings');
select tests.ok(tests.rows($$insert into public.sections (name) values ('Test Section')$$) = 1, 'admin can add a section');
select tests.ok((select count(*) from public.audit_log) > 0, 'admin can read audit log');

-- status change -> closed_at + history
update public.cases set status = 'closed' where file_number = 'B/1/2026';
select tests.ok((select closed_at from public.cases where file_number = 'B/1/2026') = (now() at time zone 'Asia/Kolkata')::date,
                'closing a case sets closed_at to today (IST)');
select tests.ok(exists (select 1 from public.case_status_history h join public.cases c on c.id = h.case_id
                        where c.file_number = 'B/1/2026' and h.from_status = 'open' and h.to_status = 'closed'
                          and h.changed_by = '00000000-0000-0000-0000-00000000000a'),
                'status change recorded in history with who changed it');
update public.cases set status = 'open' where file_number = 'B/1/2026';
select tests.ok((select closed_at from public.cases where file_number = 'B/1/2026') is null,
                'reopening clears closed_at');

-- audit diff contains only changed columns
select tests.ok((select diff ? 'subject' and not diff ? 'act' from public.audit_log
                  where table_name = 'cases' and action = 'update'
                    and record_id = '10000000-0000-0000-0000-0000000000a1'
                  order by id desc limit 1),
                'audit update diff has only changed columns');
select tests.ok((select changed_by from public.audit_log
                  where table_name = 'cases' and action = 'update'
                    and record_id = '10000000-0000-0000-0000-0000000000a1'
                  order by id limit 1) = '00000000-0000-0000-0000-0000000000a1',
                'audit records who made the change');

-- next_hearing_date sync
select tests.ok((select next_hearing_date from public.cases where file_number = 'B/1/2026') = current_date + 10,
                'next_hearing_date set from scheduled hearing');
insert into public.hearings (case_id, hearing_date) values ('10000000-0000-0000-0000-0000000000b1', current_date + 3);
select tests.ok((select next_hearing_date from public.cases where file_number = 'B/1/2026') = current_date + 3,
                'earlier hearing becomes next_hearing_date');
update public.hearings set status = 'cancelled' where hearing_date = current_date + 3;
select tests.ok((select next_hearing_date from public.cases where file_number = 'B/1/2026') = current_date + 10,
                'cancelling a hearing falls back to the next one');
insert into public.hearings (case_id, hearing_date) values ('10000000-0000-0000-0000-0000000000b1', current_date - 5);
select tests.ok((select next_hearing_date from public.cases where file_number = 'B/1/2026') = current_date + 10,
                'past hearings are ignored');

-- admin soft delete hides the case (and its children) from its officer
update public.cases set deleted_at = now() where file_number = 'A/1/2026';
select tests.ok((select count(*) from public.cases where file_number = 'A/1/2026') = 1, 'admin still sees soft-deleted case');
select tests.ok(tests.rows($$delete from public.cases where file_number = 'B/1/2026'$$) = 0,
                'nobody can hard-delete a case (admin)');
reset role;

select tests.login('00000000-0000-0000-0000-0000000000a1');
select tests.ok((select count(*) from public.cases where file_number = 'A/1/2026') = 0, 'officer no longer sees soft-deleted case');
select tests.ok((select count(*) from public.parties) = 0, 'officer no longer sees parties of soft-deleted case');
reset role;

-- ------------------------------------------------------------------ constraints
select tests.denied($$insert into public.parties (case_id, role, name, whatsapp_phone) values ('10000000-0000-0000-0000-0000000000b1', 'applicant', 'Bad', '9876543210')$$,
                'WhatsApp number must be in +91… format');
select tests.denied($$insert into public.cases (file_number, act, received_date) values ('B/1/2026', 'EC', current_date)$$,
                'file number is unique per office');
select tests.denied($$update public.cases set status = 'pending' where file_number = 'B/1/2026'$$,
                'status limited to open / closed / forwarded');

\echo 'All RLS and trigger tests passed.'
rollback;
