-- Fix advisor finding: is_admin/is_active_user/can_access_case were callable directly as
-- /rest/v1/rpc/* because they lived in the exposed `public` schema. They only ever read the
-- caller's own auth.uid() row, so this leaked nothing, but there is no reason to expose them.
-- Moving them to a `private` schema (not in Supabase's exposed API schemas) removes the RPC
-- endpoint entirely; RLS policies keep working unchanged since Postgres resolves the function
-- by object id, not by schema-qualified text.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

alter function public.is_active_user() set schema private;
alter function public.is_admin() set schema private;
alter function public.can_access_case(uuid) set schema private;
