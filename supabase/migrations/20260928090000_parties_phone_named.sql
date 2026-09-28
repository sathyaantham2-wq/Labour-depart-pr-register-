-- Adds an optional name to each phone number on a party, matching the office's existing
-- tapace.com-based paper/web form (Applicant/Management "Phone Numbers": Name + Phone pairs,
-- not just a bare list of numbers). Requested directly by the user against that reference form.
--
-- parties.phone changes from `text[]` (bare numbers) to `jsonb` — an array of
-- `{"name": "<optional>", "phone": "<required>"}` objects. No real case/party data exists yet
-- (confirmed before writing this), so the conversion below is a formality, not a real data
-- migration, but it's still written to preserve any existing bare numbers as `{"phone": "..."}`
-- (no name) rather than dropping them, in case this ever runs against a non-empty table.
--
-- Done as add-column + backfill + drop + rename rather than a single `ALTER COLUMN ... TYPE
-- ... USING`, because Postgres does not allow a subquery (needed here to unnest the old text[]
-- into jsonb objects) inside that USING expression ("cannot use subquery in transform
-- expression") — an ordinary UPDATE has no such restriction.
alter table public.parties add column phone_new jsonb;

update public.parties
   set phone_new = coalesce(
     (select jsonb_agg(jsonb_build_object('phone', p))
        from unnest(phone) as p
       where btrim(p) <> ''),
     '[]'::jsonb
   );

alter table public.parties drop column phone;
alter table public.parties rename column phone_new to phone;

alter table public.parties
  alter column phone set default '[]'::jsonb,
  alter column phone set not null;

-- Shape guard: phone must be a JSON array, and every element (if any) must be an object with a
-- non-empty string "phone" field. "name" is optional. A CHECK constraint's own expression can't
-- contain a subquery ("cannot use subquery in check constraint"), so the per-element logic lives
-- in a small function instead — the same pattern already used for private.is_admin() etc.
-- `bool_and` over zero rows is null, and `null is not false` is true, so an empty array passes.
create function private.valid_party_phone(p_phone jsonb) returns boolean
language sql immutable
set search_path = ''
as $$
  select jsonb_typeof(p_phone) = 'array'
     and (
       select bool_and(
                jsonb_typeof(elem) = 'object'
                and elem ? 'phone'
                and jsonb_typeof(elem -> 'phone') = 'string'
                and btrim(elem ->> 'phone') <> ''
              )
         from jsonb_array_elements(p_phone) as elem
     ) is not false;
$$;

alter table public.parties
  add constraint parties_phone_shape_check check (private.valid_party_phone(phone));

comment on column public.parties.phone is
  'Array of {name?, phone} objects - one row per contact phone number, each optionally named '
  '(e.g. "Son: 98765..."), matching the office''s existing case-entry form. Display/reference '
  'only - actual WhatsApp/email delivery uses whatsapp_phone and email, not this column.';
