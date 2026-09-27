-- Development seed data. The real Act / Section / Received-From master lists are still to be
-- confirmed (Setup Checklist item 11); these are the examples from the plan.
insert into public.sections (name) values
  ('JM'),
  ('Administration')
on conflict (name) do nothing;

insert into public.received_from (name) values
  ('DCL Rangareddy'),
  ('JCL RR')
on conflict (name) do nothing;
