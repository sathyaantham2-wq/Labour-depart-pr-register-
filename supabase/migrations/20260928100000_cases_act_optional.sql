-- The office's actual case register (1,736 historical records, imported directly from their
-- real Excel export) never tracks "Act" as a field at all — it doesn't exist in their data.
-- cases.act was required based on an assumption from the original plan, not the real workflow;
-- "Section" (JM, CASE WORK, Trade Union, RTI, ...) is the field the office actually uses to
-- categorize a case, and it already exists. Historical rows import with act = null.
alter table public.cases alter column act drop not null;
alter table public.cases drop constraint if exists cases_act_check;
alter table public.cases add constraint cases_act_check check (act is null or btrim(act) <> '');
