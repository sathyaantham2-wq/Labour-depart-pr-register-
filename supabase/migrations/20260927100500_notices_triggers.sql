-- Week 5: updated_at housekeeping, the notice-status roll-up trigger, and audit coverage for
-- notices (per Data Model tab's audit_log note: "written by triggers on cases, parties, hearings,
-- notices" -- notice_templates and notice_deliveries are not in that list, so no audit trigger
-- is added on them here).

create trigger notice_templates_updated_at before update on public.notice_templates
  for each row execute function public.set_updated_at();
create trigger notice_deliveries_updated_at before update on public.notice_deliveries
  for each row execute function public.set_updated_at();

create trigger notices_audit after insert or update or delete on public.notices
  for each row execute function public.audit_row();

-- ---------------------------------------------------------------- notices.status roll-up
-- Recomputes one notice's status from its notice_deliveries rows:
--   all deliveries sent/delivered/read -> 'sent'
--   all deliveries failed              -> 'failed'
--   a mix of the above (no pending)    -> 'partial'
--   any delivery still pending         -> 'pending'
--   zero delivery rows                 -> leave notices.status untouched
create function public.recompute_notice_status(p_notice_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total int;
  v_settled int; -- sent/delivered/read
  v_failed int;
  v_pending int;
  v_status text;
begin
  select count(*),
         count(*) filter (where status in ('sent', 'delivered', 'read')),
         count(*) filter (where status = 'failed'),
         count(*) filter (where status = 'pending')
    into v_total, v_settled, v_failed, v_pending
    from public.notice_deliveries
   where notice_id = p_notice_id;

  if v_total = 0 then
    return; -- nothing generated deliveries yet; shouldn't normally happen, leave status as-is
  elsif v_pending > 0 then
    v_status := 'pending';
  elsif v_settled = v_total then
    v_status := 'sent';
  elsif v_failed = v_total then
    v_status := 'failed';
  else
    v_status := 'partial';
  end if;

  update public.notices
     set status = v_status
   where id = p_notice_id
     and status is distinct from v_status;
end;
$$;
revoke execute on function public.recompute_notice_status(uuid) from public, anon, authenticated;

create function public.sync_notice_status() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_notice_status(old.notice_id);
    return null;
  end if;
  perform public.recompute_notice_status(new.notice_id);
  return null;
end;
$$;
revoke execute on function public.sync_notice_status() from public, anon, authenticated;

create trigger notice_deliveries_sync_status
  after insert or update or delete on public.notice_deliveries
  for each row execute function public.sync_notice_status();
