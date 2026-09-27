-- Week 4/9 read models for the Dashboard and Monthly MIS screens.

-- ---------------------------------------------------------------- dashboard_stats
-- Act/Section-wise Total/Open/Closed/Forwarded counts (RBAC Matrix: admin sees all sections,
-- staff sees only their own cases' counts).
--
-- `security_invoker = true` is required for that scoping to actually happen: without it, a view
-- runs with the privileges (and RLS-bypass status, if any) of its OWNER -- typically the
-- migration-runner role -- not of the person querying it, which is the classic Postgres/Supabase
-- "view silently bypasses RLS" gotcha. With security_invoker, the view's query against
-- public.cases is evaluated as the calling role, so cases RLS (admin: all; staff: own
-- assigned_officer_id) applies for free, exactly as the brief intends. This is still an ordinary
-- view -- no security-definer logic, no extra checks -- just the option needed to make "queries
-- as the calling user" true rather than assumed.
create view public.dashboard_stats
with (security_invoker = true) as
select
  c.act,
  c.section_id,
  s.name as section_name,
  count(*) as total,
  count(*) filter (where c.status = 'open') as open,
  count(*) filter (where c.status = 'closed') as closed,
  count(*) filter (where c.status = 'forwarded') as forwarded
from public.cases c
left join public.sections s on s.id = c.section_id
where c.deleted_at is null
group by c.act, c.section_id, s.name;

comment on view public.dashboard_stats is
  'Act/Section case counts for the Dashboard screen. RLS on cases scopes rows per caller '
  '(security_invoker view): admin sees every section, staff sees only their own cases.';

grant select on public.dashboard_stats to authenticated;
revoke all on public.dashboard_stats from anon;

-- ---------------------------------------------------------------- monthly_mis
-- Per section, per calendar month: received / closed / carried_forward.
--   received         = cases whose received_date falls in that month
--   closed            = cases whose closed_at falls in that month (closed_at is cleared by the
--                        cases_closed_at trigger if a case is later reopened, so a case counts as
--                        "closed" for a month only while it is still closed with that closed_at --
--                        this is the standard MIS definition and matches the column's stated
--                        purpose in the Data Model tab)
--   carried_forward   = open at month end = (received on/before month end) - (closed on/before
--                        month end), i.e. cases that existed by month end and are not currently
--                        closed with a closed_at on/before month end
--
-- OPEN DECISION (Overview tab, RBAC Matrix "View Monthly MIS" row): whether staff should see
-- their own slice of this report is explicitly left undecided in the plan. This function defaults
-- to the SAFE option the brief asked for -- admin-only -- by raising an exception for any caller
-- that is not an admin, rather than silently narrowing to "their own cases" the way dashboard_stats
-- does. See the report for why this still needs a real answer from the user.
--
-- It lives in `public`, not `private`: PostgREST/Supabase only expose functions in `public` (and
-- `graphql_public`) as RPC endpoints (see the comment in 20260927100300_move_rls_helpers_private.sql
-- -- that migration moved is_admin/is_active_user/can_access_case OUT of public for exactly the
-- opposite reason, because those are internal-only and should NOT be reachable as an RPC). The
-- Monthly MIS screen has to call this over supabase-js as `supabase.rpc('monthly_mis')`, so it must
-- stay in `public` to exist at all as an endpoint; the access control lives inside the function
-- body instead of in the schema it's exposed from.
create function public.monthly_mis()
returns table (
  section_id uuid,
  section_name text,
  month date,
  received bigint,
  closed bigint,
  carried_forward bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_start date;
begin
  if not private.is_admin() then
    raise exception 'monthly_mis: admin access only';
  end if;

  select date_trunc('month', coalesce(min(c.received_date), v_today))::date
    into v_start
    from public.cases c
   where c.deleted_at is null;

  return query
  with months as (
    select gs::date as month_start
      from generate_series(
             v_start::timestamp,
             date_trunc('month', v_today)::timestamp,
             interval '1 month'
           ) as gs
  ),
  secs as (
    select id, name from public.sections
    union all
    select null::uuid, null::text -- bucket for cases with no section
  )
  select
    secs.id as section_id,
    secs.name as section_name,
    m.month_start as month,
    count(*) filter (
      where c.received_date >= m.month_start
        and c.received_date < (m.month_start + interval '1 month')::date
    ) as received,
    count(*) filter (
      where c.closed_at is not null
        and c.closed_at >= m.month_start
        and c.closed_at < (m.month_start + interval '1 month')::date
    ) as closed,
    count(*) filter (
      where c.received_date < (m.month_start + interval '1 month')::date
        and (c.closed_at is null or c.closed_at >= (m.month_start + interval '1 month')::date)
    ) as carried_forward
  from months m
  cross join secs
  left join public.cases c
    on c.deleted_at is null
   and c.section_id is not distinct from secs.id
  group by secs.id, secs.name, m.month_start
  order by m.month_start, secs.name nulls last;
end;
$$;

revoke execute on function public.monthly_mis() from public, anon;
grant execute on function public.monthly_mis() to authenticated;
