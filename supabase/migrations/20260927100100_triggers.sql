-- Triggers that keep derived columns and history correct no matter which client writes.

-- ---------------------------------------------------------------- updated_at
create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger cases_updated_at before update on public.cases
  for each row execute function public.set_updated_at();
create trigger parties_updated_at before update on public.parties
  for each row execute function public.set_updated_at();
create trigger hearings_updated_at before update on public.hearings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- new user -> profile
-- Role comes from app_metadata (settable only by admins / service role), never from
-- user_metadata, which the user can edit.
create function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when new.raw_app_meta_data ->> 'role' = 'admin' then 'admin' else 'staff' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- case status
-- closed_at is set when a case becomes closed (IST date) and cleared if it is reopened.
create function public.set_case_closed_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'closed' then
    if tg_op = 'INSERT' or old.status is distinct from 'closed' then
      new.closed_at := coalesce(new.closed_at, (now() at time zone 'Asia/Kolkata')::date);
    end if;
  else
    new.closed_at := null;
  end if;
  return new;
end;
$$;

create trigger cases_closed_at before insert or update of status, closed_at on public.cases
  for each row execute function public.set_case_closed_at();

create function public.log_case_status() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.case_status_history (case_id, from_status, to_status, changed_by)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, auth.uid());
  end if;
  return null;
end;
$$;

create trigger cases_status_history after insert or update of status on public.cases
  for each row execute function public.log_case_status();

-- ---------------------------------------------------------------- next_hearing_date
-- Earliest scheduled hearing on or after today (IST).
create function public.refresh_next_hearing(p_case_id uuid) returns void
language sql
security definer
set search_path = ''
as $$
  update public.cases c
     set next_hearing_date = (
       select min(h.hearing_date)
         from public.hearings h
        where h.case_id = p_case_id
          and h.status = 'scheduled'
          and h.hearing_date >= (now() at time zone 'Asia/Kolkata')::date
     )
   where c.id = p_case_id
     and c.next_hearing_date is distinct from (
       select min(h.hearing_date)
         from public.hearings h
        where h.case_id = p_case_id
          and h.status = 'scheduled'
          and h.hearing_date >= (now() at time zone 'Asia/Kolkata')::date
     );
$$;
revoke execute on function public.refresh_next_hearing(uuid) from public, anon, authenticated;

create function public.sync_next_hearing() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.refresh_next_hearing(old.case_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.case_id <> old.case_id) then
    perform public.refresh_next_hearing(new.case_id);
  end if;
  return null;
end;
$$;

create trigger hearings_sync_next after insert or update or delete on public.hearings
  for each row execute function public.sync_next_hearing();

-- ---------------------------------------------------------------- audit log
-- Stores full row on insert/delete and only changed columns ({col: {old, new}}) on update.
create function public.audit_row() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_diff jsonb;
begin
  if tg_op = 'INSERT' then
    v_diff := to_jsonb(new);
  elsif tg_op = 'DELETE' then
    v_diff := to_jsonb(old);
  else
    select jsonb_object_agg(n.key, jsonb_build_object('old', o.value, 'new', n.value))
      into v_diff
      from jsonb_each(to_jsonb(new)) n
      join jsonb_each(to_jsonb(old)) o using (key)
     where n.value is distinct from o.value
       and n.key <> 'updated_at';
    if v_diff is null then
      return null; -- nothing meaningful changed
    end if;
  end if;

  insert into public.audit_log (table_name, record_id, action, changed_by, diff)
  values (
    tg_table_name,
    (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end ->> 'id')::uuid,
    lower(tg_op),
    auth.uid(),
    v_diff
  );
  return null;
end;
$$;

create trigger cases_audit after insert or update or delete on public.cases
  for each row execute function public.audit_row();
create trigger parties_audit after insert or update or delete on public.parties
  for each row execute function public.audit_row();
create trigger hearings_audit after insert or update or delete on public.hearings
  for each row execute function public.audit_row();
create trigger remarks_audit after insert or update or delete on public.remarks
  for each row execute function public.audit_row();
create trigger profiles_audit after insert or update or delete on public.profiles
  for each row execute function public.audit_row();
create trigger sections_audit after insert or update or delete on public.sections
  for each row execute function public.audit_row();
create trigger received_from_audit after insert or update or delete on public.received_from
  for each row execute function public.audit_row();

-- Trigger functions are not meant to be called directly.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.log_case_status() from public, anon, authenticated;
revoke execute on function public.sync_next_hearing() from public, anon, authenticated;
revoke execute on function public.audit_row() from public, anon, authenticated;
