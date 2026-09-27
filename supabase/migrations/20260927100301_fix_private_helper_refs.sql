-- The previous migration moved is_admin/is_active_user/can_access_case to the `private` schema,
-- but can_access_case's body still called the old `public.is_admin()` name literally (SQL-language
-- function bodies resolve schema-qualified names at call time, they are not rebound automatically
-- when a function is moved). This broke every policy that reads case-child tables (parties,
-- hearings, remarks, case_status_history) with "function public.is_admin() does not exist".
create or replace function private.can_access_case(p_case_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_admin()
      or exists (
           select 1
             from public.cases c
             join public.profiles p on p.id = c.assigned_officer_id
            where c.id = p_case_id
              and c.deleted_at is null
              and p.id = auth.uid()
              and p.active
         );
$$;
