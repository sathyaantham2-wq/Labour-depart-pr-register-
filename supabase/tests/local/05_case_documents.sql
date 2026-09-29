-- Tests for public.case_documents (20260929090000_case_documents.sql): RLS for listing,
-- adding and removing documents on a Current Entry, and the private `case-documents` bucket.
\set ON_ERROR_STOP 1
begin;

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

create function tests.rows(sql text) returns int
language plpgsql as $$
declare n int;
begin
  execute sql;
  get diagnostics n = row_count;
  return n;
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
  ('d1111111-1111-1111-1111-111111111111', 'admin5@test.local', '{"role":"admin"}', '{"full_name":"Head 5"}'),
  ('d2222222-2222-2222-2222-222222222222', 'staffa5@test.local', '{}', '{"full_name":"Officer A5"}'),
  ('d3333333-3333-3333-3333-333333333333', 'staffb5@test.local', '{}', '{"full_name":"Officer B5"}');

insert into public.cases (id, file_number, received_date, subject, status, assigned_officer_id, created_by) values
  ('dddddddd-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'DOC-A/1/2026', current_date, 'Case A (docs)', 'open',
   'd2222222-2222-2222-2222-222222222222', 'd2222222-2222-2222-2222-222222222222'),
  ('dddddddd-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'DOC-B/1/2026', current_date, 'Case B (docs)', 'open',
   'd3333333-3333-3333-3333-333333333333', 'd3333333-3333-3333-3333-333333333333');

-- ------------------------------------------------------------------ anon: nothing
set local role anon;
select tests.denied('select * from public.case_documents', 'anon cannot read case_documents');
reset role;

-- ------------------------------------------------------------------ staff A on own entry
select tests.login('d2222222-2222-2222-2222-222222222222');
select tests.ok(tests.rows($$insert into public.case_documents (id, case_id, file_name, storage_path, content_type, size_bytes)
  values ('d0c00000-0000-0000-0000-00000000000a', 'dddddddd-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'complaint.pdf',
          'cases/dddddddd-aaaa-aaaa-aaaa-aaaaaaaaaaaa/a-complaint.pdf', 'application/pdf', 1024)$$) = 1,
  'staff A can attach a document to their own entry');
select tests.ok((select uploaded_by from public.case_documents where id = 'd0c00000-0000-0000-0000-00000000000a')
                = 'd2222222-2222-2222-2222-222222222222', 'uploaded_by defaults to the signed-in user');
select tests.denied($$insert into public.case_documents (case_id, file_name, storage_path, content_type, size_bytes)
  values ('dddddddd-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'x.pdf', 'cases/dddddddd-bbbb-bbbb-bbbb-bbbbbbbbbbbb/x.pdf', 'application/pdf', 10)$$,
  'staff A cannot attach a document to staff B''s entry');
select tests.denied($$insert into public.case_documents (case_id, file_name, storage_path, content_type, size_bytes, uploaded_by)
  values ('dddddddd-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'y.pdf', 'cases/dddddddd-aaaa-aaaa-aaaa-aaaaaaaaaaaa/y.pdf', 'application/pdf', 10,
          'd3333333-3333-3333-3333-333333333333')$$,
  'staff A cannot record a document as uploaded by someone else');
select tests.denied($$insert into public.case_documents (case_id, file_name, storage_path, content_type, size_bytes)
  values ('dddddddd-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'big.pdf', 'cases/dddddddd-aaaa-aaaa-aaaa-aaaaaaaaaaaa/big.pdf', 'application/pdf', 30000000)$$,
  'documents over 20 MB are rejected');
select tests.denied($$insert into public.case_documents (case_id, file_name, storage_path, content_type, size_bytes)
  values ('dddddddd-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'z.pdf', 'elsewhere/z.pdf', 'application/pdf', 10)$$,
  'storage paths must live under cases/');
select tests.denied($$update public.case_documents set file_name = 'renamed.pdf' where id = 'd0c00000-0000-0000-0000-00000000000a'$$,
  'documents cannot be edited in place');
reset role;

-- staff B's own document (inserted as postgres to set up the next checks)
insert into public.case_documents (id, case_id, file_name, storage_path, content_type, size_bytes, uploaded_by) values
  ('d0c00000-0000-0000-0000-00000000000b', 'dddddddd-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'memo.pdf',
   'cases/dddddddd-bbbb-bbbb-bbbb-bbbbbbbbbbbb/b-memo.pdf', 'application/pdf', 2048, 'd3333333-3333-3333-3333-333333333333');

select tests.login('d2222222-2222-2222-2222-222222222222');
select tests.ok((select count(*) from public.case_documents) = 1, 'staff A lists only documents on their own entries');
select tests.ok(tests.rows($$delete from public.case_documents where id = 'd0c00000-0000-0000-0000-00000000000b'$$) = 0,
  'staff A cannot delete staff B''s document');
reset role;

select tests.login('d1111111-1111-1111-1111-111111111111'); -- admin
select tests.ok((select count(*) from public.case_documents) = 2, 'admin lists documents on every entry');
select tests.ok(tests.rows($$delete from public.case_documents where id = 'd0c00000-0000-0000-0000-00000000000b'$$) = 1,
  'admin can delete any document');
reset role;

select tests.login('d2222222-2222-2222-2222-222222222222');
select tests.ok(tests.rows($$delete from public.case_documents where id = 'd0c00000-0000-0000-0000-00000000000a'$$) = 1,
  'the uploader can delete their own document');
reset role;

select tests.ok((select count(*) from public.audit_log where table_name = 'case_documents' and action = 'delete') = 2,
  'document removals are written to the audit log');

-- ------------------------------------------------------------------ storage bucket: service_role only
select tests.ok((select not public from storage.buckets where id = 'case-documents'), 'case-documents bucket is private');
select tests.login('d2222222-2222-2222-2222-222222222222');
select tests.denied($$insert into storage.objects (bucket_id, name) values ('case-documents', 'cases/dddddddd-aaaa-aaaa-aaaa-aaaaaaaaaaaa/sneaky.pdf')$$,
  'signed-in users cannot write to the documents bucket directly');
reset role;

\echo 'All case-documents tests passed.'
rollback;
