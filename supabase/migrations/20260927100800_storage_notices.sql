-- Week 5: private Storage bucket for generated notice documents.
-- Path convention (Automation tab): cases/{case_id}/{notice_id}.docx
--
-- Storage RLS approach chosen: SERVICE ROLE ONLY -- no `create policy` on storage.objects here.
-- Rationale (see report for the fuller write-up):
--   * The only writer is the notice-generation API route, which runs server-side with
--     SUPABASE_SERVICE_ROLE_KEY (bypasses RLS by design) and already checks
--     private.can_access_case()-equivalent authorization in application code before uploading.
--   * The only reads happen through short-lived signed URLs (Automation tab: 7-day expiry)
--     minted server-side with the same service role key and handed to the client. A signed URL's
--     token grants access directly at the storage layer and is not itself subject to
--     storage.objects RLS, so authenticated users never need a `select` policy to open a notice
--     they were handed a link to, and -- just as important -- they get no policy that would let
--     them list or read the bucket directly.
--   * Supabase enables Row Level Security on storage.objects for every project by default. With
--     zero policies added for this bucket's rows, `anon` and `authenticated` are denied by
--     default; `service_role` bypasses RLS entirely regardless of policies. That is exactly the
--     "only service_role can write" / "no direct read" posture the brief offered as the simpler
--     alternative to per-path policy parsing, and it avoids re-deriving case_id from an object
--     path inside a policy expression.
insert into storage.buckets (id, name, public)
values ('notices', 'notices', false)
on conflict (id) do nothing;
