# Scenario 4 — Admin Digest

Source: Automation tab, "Optional but recommended" row (never built until now). A daily summary of
notice activity, emailed to the admin/head.

> **Design note — this is NOT a Make.com scenario.** It is a **Supabase Edge Function
> (`supabase/functions/admin-digest/index.ts`) triggered by `pg_cron`**, calling Resend directly.
> See "Why an Edge Function, not Make.com" below. Despite the different mechanism, this file keeps
> the same section shape as Scenarios 1–3 (trigger / contract / logic steps / filters / error
> handling / data mapping) so the four specs read as one set. Where a Make.com-specific term
> doesn't apply (e.g. "modules"), the nearest equivalent is used instead (e.g. "logic steps").

## Why an Edge Function, not Make.com

`automation/README.md` and this agent's brief already establish the governing rule: **email is out
of scope for Make.com entirely** — the app sends every other notice email directly via Resend
(`src/lib/notices/email.ts`), specifically *because* email has no Meta-style constraint forcing it
through a third-party Business API the way WhatsApp does. The admin digest is a **pure email**, sent
to **internal staff addresses** (`profiles.email`, not a party's contact) — there is no WhatsApp
leg, no Meta template, nothing that requires Make.com's WhatsApp-provider connection at all. Routing
a plain transactional email through Make.com here would reintroduce exactly the pattern the rest of
this codebase just moved away from, for no benefit:

- **No new capability Make.com would add.** Scenario 2/3 use Make.com for things a single Next.js
  request can't easily do (fan-out to a third-party WhatsApp provider, a visual retry/escalation
  flow). The digest is "query two tables, format a table, POST to Resend" — the same three steps
  `sendNoticeEmail()` already does for every other notice email, just aggregated instead of
  per-notice.
- **Consistency**: if this digest goes through Make.com, the codebase would have *two* email code
  paths (direct Resend for notices, Make.com→Resend-or-other-provider for the digest) instead of
  one. One path is easier to reason about, monitor, and rotate secrets for.
- **Cost**: Make.com bills per operation. A daily digest is 1 run/day — negligible either way — but
  there's no reason to spend even that when `pg_cron` + Edge Functions cost nothing extra on a
  Supabase plan that already runs `due-hearings` this way.
- **Tradeoff acknowledged**: `automation/README.md`'s own "Alternative" section notes Make.com's
  visual scenario history is a readable audit trail for a non-technical admin, which a `pg_cron` job
  doesn't give you for free. For the digest specifically, that tradeoff doesn't bite: the digest
  *is itself* the audit artifact (an email listing what happened), so there's nothing left to
  audit-the-audit. Scenario 3's escalation email has the same shape (plain transactional email to
  `profiles.email`) and this doc's design mirrors it.

If this reasoning is later rejected (e.g. the office wants every outbound message, digest included,
visible in one Make.com execution history), the fallback is straightforward: replace the `pg_cron`
schedule with a Make.com Schedule module calling a thin read-only endpoint for the same two grouped
queries below, then an Email module. Not built here because it contradicts the established
Make.com-has-no-email-role principle without a concrete reason to make an exception.

## Trigger

**`pg_cron`**, daily at **18:00 Asia/Kolkata**.

`pg_cron` schedules run in the database server's timezone, which on Supabase is UTC — so the actual
cron expression is `30 12 * * *` (12:30 UTC = 18:00 IST, no DST in India so this offset is stable
year-round). This is a **migration change** (`cron.schedule(...)`, plus enabling the `pg_cron` and
`pg_net` extensions if not already on) — **db-architect's territory, not written here.** See
"What db-architect needs to add" below for the exact SQL to review.

**Why 18:00 IST**: it runs after both of the day's other scheduled jobs —Scenario 2's batch notify
(09:00 IST) and Scenario 3's retry (14:00 IST) — so the digest reflects same-day batch creation *and*
same-day retry attempts, not just whatever happened before the last cron fired. It's also well before
the next morning's 09:00 batch, giving the admin/head a full evening to notice a `failed` spike and
follow up before the next day's cases move forward. (Earlier evening times like 17:00 were considered
and rejected only for tie-breaking reasons — nothing about the query itself is sensitive to the exact
hour, since it's a rolling 24-hour window, not a calendar-day boundary; see "Window is rolling, not
calendar-day" below.)

## Function contract (`supabase/functions/admin-digest/index.ts`)

**Request**: `POST` (or `GET`, accepted for manual/curl testing) `/functions/v1/admin-digest`,
optional `?hours=N` query param (default **24**; see "Daily vs weekly" below), header
`x-webhook-secret: <ADMIN_DIGEST_SECRET>`.

**Response `200`** (on a successful send):
```jsonc
{
  "sent": true,
  "recipients": ["head@example.gov.in", "..."],
  "window": { "start": "2026-09-26T12:30:00.000Z", "end": "2026-09-27T12:30:00.000Z" },
  "notices": { "sent": 7, "partial": 1, "pending": 2, "failed": 1 },
  "deliveries": { "email|sent": 9, "email|failed": 1, "whatsapp|sent": 5, "whatsapp|failed": 2 }
}
```
**Response `200`, nothing to do**: `{ "sent": false, "reason": "no_active_admin_recipients" }` — not
an error; logged and the run ends quietly (see Error handling).

**Response `401`/`500`/`502`**: secret mismatch / misconfiguration / Resend rejected the send —
surfaces in the Edge Function's own invocation logs (Supabase Dashboard → Edge Functions → Logs),
which is this design's equivalent of Make.com's execution history for debugging a failed run.

## A THIRD secret: `ADMIN_DIGEST_SECRET`

Same reasoning as `due-hearings`' `DUE_HEARINGS_SECRET` (see that function's header comment):
independent rotation, smaller blast radius, deployed on a different pipeline than the Next.js app.
This function's only caller is `pg_cron` (via the `pg_net` extension's `net.http_post`), never
Make.com and never the Next.js app directly — so it gets its own secret rather than reusing
`DUE_HEARINGS_SECRET` just because both happen to be Edge Functions. Set via
`npx supabase secrets set ADMIN_DIGEST_SECRET=...`; the same value must be passed in the `pg_cron`
job's `net.http_post` headers, which db-architect's migration should source from **Supabase Vault**
(`vault.create_secret` + `vault.decrypted_secrets`) rather than pasting the value in plaintext into a
migration file that lands in git — flagged again below.

## Logic steps, in order (inside the Edge Function)

1. **Secret check** — fail closed if `ADMIN_DIGEST_SECRET` isn't set server-side (never means "no
   auth required"); constant-time compare against `x-webhook-secret`, same `safeEqual()` helper as
   `due-hearings/index.ts`.
2. **Compute the window**: `windowEnd = now()`, `windowStart = windowEnd - {hours}` (default 24).
   See "Window is rolling, not calendar-day" below for why this needs none of `due-hearings`' IST
   calendar-date gymnastics.
3. **Three queries, run in parallel** (all via the service-role client — this function's only
   consumer is `pg_cron`, so there's no per-caller RLS scoping to worry about, same as
   `due-hearings`):
   - `notices` generated in the window, `select status` only, grouped client-side by `status`
     (`pending` / `partial` / `sent` / `failed`).
   - `notice_deliveries` **touched** in the window (see below), `select channel, status`, grouped
     client-side by `channel × status`.
   - `profiles where role = 'admin' and active = true`, `select email, full_name` — the recipient
     list.
4. **No active admin recipients** → log a warning, return `{sent: false, reason:
   "no_active_admin_recipients"}`, do not attempt a send. (Not treated as an error: a 2-person office
   with no `admin`-role profile yet, or a temporarily deactivated one, shouldn't fail the cron job.)
5. **Render the email** (HTML + plain-text) — one table for notices-by-status, one for
   deliveries-by-channel-by-status, plus the window's start/end rendered in IST for readability (the
   query itself doesn't need IST, but a human reading "12:30 UTC" would have to do the conversion
   themselves).
6. **Send via Resend's HTTP API directly** (`POST https://api.resend.com/emails` with
   `Authorization: Bearer ${RESEND_API_KEY}`) — **not** the `resend` npm package. Deno *can* import
   npm packages (`due-hearings` does this for `@supabase/supabase-js`), but a raw `fetch` avoids
   pulling in an SDK for a single API call, keeping this function a single small file with no extra
   dependency resolution. `to` = every recipient email from step 3 (Resend accepts an array); `from`
   = `NOTICES_FROM_EMAIL` (reused — see "Which from-address" below).
7. **Return the summary JSON** (shown above) — this is the function's own audit trail, visible in
   Edge Function invocation logs, standing in for a Make.com execution history entry.

## Window is rolling, not calendar-day

`due-hearings` needed `Intl.DateTimeFormat` gymnastics to compare `hearing_date` (a `date` column)
against IST calendar days without an off-by-one at midnight. This function doesn't have that problem:
`notices.generated_at` and `notice_deliveries.updated_at` are both `timestamptz`, and the filter is a
**rolling** window (`now() - interval`), not a calendar-day boundary — `now() - 24h` means the same
instant in every timezone. IST only matters for *display* (rendering the window's start/end in the
email body) and for *when the cron fires* (18:00 IST), never for the query's correctness.

## Which columns define "in the last 24h" — and why deliveries use `updated_at`, not a join to `notices.generated_at`

- **Notices**: `generated_at >= windowStart`. Simple — this is exactly when the notice was created.
- **Deliveries**: `updated_at >= windowStart`, not `notices.generated_at` via a join. `updated_at`
  defaults to `now()` at insert (so a delivery created today has `updated_at` = today) **and** is
  bumped by the existing `notice_deliveries_updated_at` trigger on every subsequent write — which
  includes Scenario 1's writeback, Scenario 3's retry writeback, and the manual email-retry endpoint.
  Filtering on `updated_at` therefore captures **all delivery activity in the window**, including a
  retry today for a notice that was originally generated yesterday (or earlier) — which a join to
  `notices.generated_at` would silently miss. This is the one place this scenario's design goes
  slightly beyond the task brief's literal "notices/deliveries in the last 24h" phrasing, and it's a
  deliberate improvement: a digest that only reflects yesterday's *new* notices would under-report a
  day where the main activity was Scenario 3 successfully clearing yesterday's backlog.

## Filters

| Filter | Condition |
|---|---|
| Secret check | `x-webhook-secret` header == `ADMIN_DIGEST_SECRET` (fail closed if unset) |
| Notices in window | `notices.generated_at >= now() - interval '{hours} hours'` |
| Deliveries in window | `notice_deliveries.updated_at >= now() - interval '{hours} hours'` |
| Recipients | `profiles.role = 'admin' AND profiles.active = true` |

## Daily vs weekly

The Automation tab says "daily/weekly" without picking one. This design defaults to **daily** (the
task's own steer: "after the day's activity, before the next morning's batch run") but the
`?hours=N` query param (mirroring `due-hearings`' `?days=N`) makes weekly a same-code, different-cron
option: a second `cron.schedule(...)` entry (e.g. Sunday 18:00 IST) calling
`.../admin-digest?hours=168` needs no code change, just a second migration-level cron job if the
office wants both cadences. Not added by default — one daily digest is the safer starting point;
add the weekly one only if daily turns out to be too noisy in practice.

## Which from-address

Reuses `NOTICES_FROM_EMAIL` (already verified in the Resend dashboard for the notice-email domain)
rather than introducing a second sender identity (`ADMIN_DIGEST_FROM_EMAIL`) that would need its own
domain verification for no real benefit — the digest and notice emails come from the same office
system either way. If the office later wants the digest to visibly come from a different address
(e.g. `noreply-reports@` vs `notices@`), that's a one-line env var addition, not a design change.

## Error handling

- Secret missing/mismatched → `500`/`401`, no query run, no send attempted (fail closed, same as
  `due-hearings`).
- Any of the three queries fails (Postgres error, timeout) → the whole run fails (`500`), nothing is
  sent — a digest built from partial data (e.g. missing the deliveries breakdown) would be actively
  misleading to whoever reads it, so this deliberately does **not** degrade to "send what we have."
  Surfaces in Edge Function logs; `pg_cron`'s own job-run history (`cron.job_run_details`) also
  records the failed HTTP status if `net.http_post`'s response is checked (see the migration note
  below).
- Resend rejects the send (`4xx`/`5xx`) → `502`, logged with the response body (truncated), matching
  the truncation convention Scenario 1 uses for provider errors. There is **no retry** for a failed
  digest send — if 18:00 IST's run fails, the office finds out via a missing digest email plus
  whatever cron-failure alerting `pg_cron`/Supabase provides; a broken digest pipeline is lower
  stakes than a broken notice pipeline (no legal deadline rides on the digest itself), so a full
  retry scenario the way Scenario 3 has for notices would be over-engineering. If this turns out to
  be wrong in practice, the cheapest fix is scheduling a second, slightly later `pg_cron` run of the
  same job on failure days, not a new retry mechanism.
- No active admin recipients → not an error, see step 4 above.

## Data mapping reference

| Digest field | Source |
|---|---|
| Notices-by-status counts | `notices.status` (the trigger-maintained rollup: `pending`/`partial`/`sent`/`failed`), filtered on `generated_at` |
| Deliveries-by-channel-by-status counts | `notice_deliveries.channel` × `notice_deliveries.status`, filtered on `updated_at` |
| Recipients | `profiles.email` where `role = 'admin' AND active = true` |
| From address | `NOTICES_FROM_EMAIL` env var (same as `src/lib/notices/email.ts`) |
| Window display (IST) | `windowStart`/`windowEnd`, formatted with `Intl.DateTimeFormat(..., {timeZone: "Asia/Kolkata"})` for the email body only |

## No double-sends

A digest email isn't a `notices`/`notice_deliveries` row, so the schema's usual dedupe mechanisms
(`idempotency_key`, the unique `(notice_id, party_id, channel)` constraint) don't apply and aren't
needed here — there is nothing being "delivered to a party" that could double-send in the way a
notice can. The only double-send risk is `pg_cron` somehow firing the same scheduled job twice
(not a normal occurrence) or someone manually re-invoking the function. Given the low stakes (an
admin getting the same summary email twice, not a party being served a legal notice twice), this
design accepts that small residual risk rather than adding a dedupe table (e.g. one row per
digest-date) purely to guard against an edge case `pg_cron` itself is expected to prevent. If it
becomes a real problem, a one-column `admin_digest_log(sent_for_date date primary key)` table with an
`insert ... on conflict do nothing` gate at the top of the function would close it — not added
preemptively.

## What db-architect needs to add (migration — not written here)

This function cannot schedule itself. A migration is needed to:
1. Enable the `pg_cron` extension (`create extension if not exists pg_cron;`) if not already on —
   check `supabase/migrations/` and `list_extensions` first, since Supabase projects sometimes have
   it pre-enabled.
2. Enable `pg_net` if not already on (needed for `net.http_post` from inside `cron.schedule`).
3. Store `ADMIN_DIGEST_SECRET`'s value in **Supabase Vault**, not inline in the migration SQL:
   `select vault.create_secret('<the-generated-value>', 'admin_digest_secret');` — run once,
   interactively, not committed to a migration file (a migration file is git history forever; a
   secret pasted into one is a leak the moment the repo is shared, exactly the concern the
   `due-hearings` header comment raises about this function's own secret showing up in Make.com's
   visible logs).
4. Schedule the job, reading the secret back out of Vault at call time:
   ```sql
   select cron.schedule(
     'admin-digest-daily',
     '30 12 * * *', -- 18:00 Asia/Kolkata
     $$
     select net.http_post(
       url := 'https://<project-ref>.supabase.co/functions/v1/admin-digest',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'admin_digest_secret')
       ),
       body := '{}'::jsonb
     );
     $$
   );
   ```
   (Exact syntax to be verified by db-architect against the Supabase project's actual `pg_cron`/
   `pg_net` versions — given here as a starting point, not a tested statement.)

## Optional: a `daily_notice_digest_stats` view

Not required — the Edge Function above queries `notices` and `notice_deliveries` directly with two
plain filtered/grouped `select`s, exactly the "simple filtered aggregate, no multi-table 'what's
missing' logic" the task brief anticipated (unlike `due-hearings`, which needed a `not in (...)`
anti-join across `hearings` and `notices`). A view would only help if the office also wants to
**browse** the same numbers interactively (Supabase Table Editor, or a future in-app Admin screen)
without waiting for the daily email. If that turns out to be wanted, the exact shape this doc's
function assumes would be:

```
create view public.daily_notice_digest_stats as
  select 'notice'::text as source, status, null::text as channel, count(*) as n
    from public.notices
   where generated_at >= now() - interval '24 hours'
   group by status
  union all
  select 'delivery'::text, status, channel, count(*)
    from public.notice_deliveries
   where updated_at >= now() - interval '24 hours'
   group by channel, status;
```
i.e. columns `source` (`'notice' | 'delivery'`), `status`, `channel` (`null` for notice rows), `n`.
`security_invoker` isn't needed here the way `dashboard_stats` needs it (this function always queries
as service role, never as a per-user caller), but db-architect may still want it on for defense in
depth if the view is ever exposed to `authenticated` too. Left as a recommendation only, per this
agent's brief — not created here.
