-- Closes a gap flagged by the frontend agent building the Case Details party forms: nothing
-- stopped two rows for the same role (applicant/management) existing on one case. The app
-- worked around it with a look-up-then-update pattern, which is still racy under concurrent
-- requests (e.g. two browser tabs saving the Applicant card at once). A real constraint removes
-- the race entirely; the application code's existing "look up existing row first" pattern
-- continues to work unchanged and now simply can't ever create a duplicate even if that check
-- loses a race, since the second insert will fail with 23505 instead of silently succeeding.
alter table public.parties
  add constraint parties_case_role_unique unique (case_id, role);
