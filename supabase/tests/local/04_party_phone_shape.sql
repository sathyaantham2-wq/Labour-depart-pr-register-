-- Tests for parties.phone's jsonb shape (added in 20260928090000_parties_phone_named.sql):
-- an array of {name?, phone} objects, phone required and non-empty, name optional.
-- Self-contained per scripts/db-local.mjs (each test file runs as its own `psql -f`).
\set ON_ERROR_STOP 1
begin;

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

grant execute on all functions in schema tests to anon, authenticated;

-- Fixtures: one admin, one case they can write to (as themselves).
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'phoneshape@test.local', '{"role":"admin"}');
select tests.login('00000000-0000-0000-0000-0000000000a1');
insert into public.cases (id, file_number, act, received_date)
values ('10000000-0000-0000-0000-0000000000f1', 'PHONE/1/2026', 'EC', current_date);

-- Direct function checks (private.valid_party_phone), bypassing insert overhead.
select tests.ok(private.valid_party_phone('[]'::jsonb), 'empty array is valid');
select tests.ok(
  private.valid_party_phone('[{"phone": "9876543210"}]'::jsonb),
  'a phone-only entry (no name) is valid'
);
select tests.ok(
  private.valid_party_phone('[{"name": "Son", "phone": "9876543210"}]'::jsonb),
  'a named entry is valid'
);
select tests.ok(
  private.valid_party_phone('[{"name": "A", "phone": "111"}, {"phone": "222"}]'::jsonb),
  'a mix of named and unnamed entries is valid'
);
select tests.ok(not private.valid_party_phone('{"phone": "9876543210"}'::jsonb), 'a bare object (not an array) is invalid');
select tests.ok(not private.valid_party_phone('["9876543210"]'::jsonb), 'a bare string element (old shape) is invalid');
select tests.ok(not private.valid_party_phone('[{"phone": ""}]'::jsonb), 'an empty phone string is invalid');
select tests.ok(not private.valid_party_phone('[{"name": "Son"}]'::jsonb), 'a name with no phone key at all is invalid');
select tests.ok(not private.valid_party_phone('[{"phone": 9876543210}]'::jsonb), 'a numeric (non-string) phone value is invalid');

-- End-to-end via a real insert: the CHECK constraint itself rejects a bad shape...
select tests.denied(
  $$insert into public.parties (case_id, role, name, phone)
    values ('10000000-0000-0000-0000-0000000000f1', 'applicant', 'Bad Shape', '["9876543210"]'::jsonb)$$,
  'inserting the old bare-string-array shape is rejected by the new constraint'
);
select tests.denied(
  $$insert into public.parties (case_id, role, name, phone)
    values ('10000000-0000-0000-0000-0000000000f1', 'applicant', 'Empty Phone', '[{"phone": ""}]'::jsonb)$$,
  'inserting an empty phone string is rejected'
);

-- ...and a well-formed insert (with a name attached, and the default empty array) succeeds.
-- (INSERT run as its own top-level statement, then checked via SELECT — a data-modifying WITH
-- must be at the top level, so it can't sit inside tests.ok(...)'s argument expression.)
insert into public.parties (case_id, role, name, phone)
values (
  '10000000-0000-0000-0000-0000000000f1', 'applicant', 'Good Shape',
  '[{"name": "Son", "phone": "9876543210"}, {"phone": "1234567890"}]'::jsonb
);
select tests.ok(
  (select phone from public.parties where name = 'Good Shape')
    = '[{"name": "Son", "phone": "9876543210"}, {"phone": "1234567890"}]'::jsonb,
  'a well-formed named+unnamed phone array is stored exactly as given'
);

insert into public.parties (case_id, role, name)
values ('10000000-0000-0000-0000-0000000000f1', 'management', 'No Phone Given');
select tests.ok(
  (select phone from public.parties where name = 'No Phone Given') = '[]'::jsonb,
  'omitting phone entirely defaults to an empty array'
);

\echo 'All party-phone-shape tests passed.'
rollback;
