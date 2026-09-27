# Automation — Make.com Scenarios for Notice Delivery

This directory holds the Make.com scenario specs, a best-effort blueprint, and WhatsApp template
drafts for the Labour Case Management app's notification automation. Source of truth: the
**Automation** and **Setup Checklist** tabs of `Labour_Portal_Full_Development_Plan.xlsx`.

## Files

| File | What it is |
|---|---|
| `scenario-1-immediate-notify.md` | Full spec — webhook fires on notice creation, sends WhatsApp to both parties, writes back per delivery. Email is sent directly by the app (Resend), not through this scenario — see the update note at the top of that file. |
| `scenario-2-batch-notify.md` | Full spec — daily cron finds due hearings (via the Edge Function below) and creates+sends their notices. |
| `scenario-3-retry-failed.md` | Full spec — daily cron retries failed deliveries (up to 3 attempts), escalates to the assigned officer on the 3rd failure. |
| `whatsapp-templates.md` | Draft Meta WhatsApp templates (English filled in; Telugu marked TBD — see below). |
| `setup-checklist.md` | Ordered, concrete steps for the user to click through once a WhatsApp provider is chosen. |
| `blueprints/scenario-1-immediate-notify.blueprint.json` | Best-effort Make.com blueprint for Scenario 1 (see caveats in that file and below). |
| `../supabase/functions/due-hearings/index.ts` | The Edge Function Scenario 2 calls to find due hearings. |

## Make.com operations estimate

> **Update (post-launch):** email is sent directly by the app (Resend) and never touches Make.com,
> so it costs zero Make.com operations regardless of volume. The table below is now **WhatsApp
> only** — roughly half the original ~10 ops/notice estimate (which assumed both channels went
> through Make.com; see the Automation tab's original row 14 for that superseded figure).

Make.com bills by **operation** — roughly, one operation per module execution per scenario run
(a router split itself is typically free; each branch's modules each cost an op; a webhook trigger
and an HTTP call both cost 1 op each). Walking through Scenario 1 for a notice going to **both**
parties on WhatsApp (both have a WhatsApp number on file — the worst case for ops, though in
practice many parties won't have one yet):

| Step | Modules | Ops |
|---|---|---|
| Webhook trigger | 1 | 1 |
| Secret filter | 1 (filter, not a full module in Make's op-counting, but budget it as 1 to be safe) | 1 |
| Router (applicant/management split) | 0 (routing itself is free) | 0 |
| Applicant → WhatsApp send | 1 | 1 |
| Applicant → WhatsApp writeback | 1 | 1 |
| Management → WhatsApp send | 1 | 1 |
| Management → WhatsApp writeback | 1 | 1 |
| **Total per notice (both parties, WhatsApp only)** | | **~6 ops** |

If a notice has no WhatsApp deliveries at all (neither party has a WhatsApp number on file), the
webhook is never called (see `src/app/api/notices/route.ts`) — **0 ops** for that notice.

### Volume assumption and monthly cost

Stated assumption, matching the Automation tab's own worked example: **~10 notices/day** average
across immediate (Scenario 1, user-triggered) and batch (Scenario 2, cron-triggered — each due
hearing becomes one notice, routed back through Scenario 1) combined, with occasional retries
(Scenario 3) adding a small fraction more.

- 10 notices/day × ~6 ops/notice = **~60 ops/day** ≈ **~1,800 ops/month** (assuming every notice
  reaches a WhatsApp-capable party on both sides — the realistic figure will be lower until most
  parties have a WhatsApp number on file, since a notice with zero WhatsApp deliveries costs 0 ops).
- Scenario 2's own overhead (1 schedule trigger + 1 Edge Function call + 1 op per due hearing for
  the `POST /api/notices` call) and Scenario 3's overhead (1 schedule + 1 PostgREST query + 1
  signed-URL mint per retried WhatsApp delivery) are both small relative to the Scenario 1 volume
  they feed, since most days most notices succeed on the first attempt.
- The Automation tab's own row 14 used a **50 notices/day**, both-channels-via-Make.com assumption
  and landed at **~11,000 ops/month** — that figure is now roughly halved by moving email out of
  Make.com entirely: **~50 notices/day × ~6 ops ≈ 9,000 ops/month** at the same busier-office volume.
- **This still exceeds the Make.com free tier (1,000 ops/month)** at either volume assumption once
  WhatsApp is actually in regular use, so a paid Make.com plan is still needed — just a cheaper one,
  or one that lasts longer before an upgrade, than before this change.

## Alternative: Supabase pg_cron + Edge Functions (no per-operation cost)

Instead of Make.com owning the Router/Email/WhatsApp/writeback logic, the same three scenarios
could be implemented as:

- **Scenario 1** → a Postgres trigger on `notices`/`notice_deliveries` insert (or the
  `POST /api/notices` route itself, synchronously) calling a `send-notice` Edge Function that hits
  the Email and WhatsApp provider APIs directly and writes `notice_deliveries` in the same
  transaction/request — no webhook round-trip to a third party at all.
- **Scenario 2** → `pg_cron` scheduling a `SELECT net.http_post(...)` (or a direct `pg_cron` job
  calling the `due-hearings` logic in SQL/plpgsql, skipping the Edge Function's HTTP layer
  entirely) to the same `send-notice` Edge Function per due hearing, daily at 9 AM IST.
- **Scenario 3** → a second `pg_cron` job, daily at 2 PM IST, querying
  `notice_deliveries WHERE status = 'failed' AND attempt_count < 3` directly in SQL and calling
  `send-notice` again per row.

**Tradeoff**: Supabase Edge Function invocations and `pg_cron` are billed on compute/invocation
volume already included in or cheap relative to a Supabase plan — there is no separate
per-operation line item the way Make.com's op-count pricing works, so this is meaningfully cheaper
at any real volume. The cost is losing Make.com's visual scenario editor, built-in execution
history/replay UI, and no-code editability — retries, error branching, and provider-specific
payload shaping all become hand-written TypeScript in the Edge Function instead of drag-and-drop
modules a non-developer can inspect or tweak. For a 2-person office relying on an external
developer (or this agent) for changes anyway, the no-code UI's value is mostly about *visibility*
(a Make.com scenario execution history is a very readable audit trail for "did this notice go out
and why not"), which the pg_cron approach would need to rebuild explicitly (e.g. logging into a
Postgres table, since Edge Function logs are less discoverable to a non-technical admin than
Make's UI). **Recommendation**: start with Make.com per this spec (matches the Automation tab and
gives the office a debuggable UI while the system is new and every failure needs eyeballing), and
revisit pg_cron only if/when volume genuinely outgrows a Make.com paid tier's cost-effectiveness —
that crossover point depends on Make's current pricing, not on anything in this codebase.

## On the blueprint JSON

`blueprints/scenario-1-immediate-notify.blueprint.json` is a best-effort Make.com blueprint,
structurally validated against Make's blueprint schema (via the read-only
`validate_blueprint_schema` tool — confirms the JSON *shape* is well-formed, **not** that every
module name/parameter is correct or importable as-is). It deliberately uses Make's generic
`http:ActionSendData` ("Make a request") module for both Email and WhatsApp sends, instead of a
provider-specific native app module, **on purpose**: the WhatsApp provider (Gupshup / 360dialog /
Twilio) and Email provider are both still open decisions per the Setup Checklist, and a
provider-agnostic HTTP module works with whichever is chosen without rebuilding the scenario. Swap
in a native module later if preferred — the writeback modules and overall flow shape don't change
either way.

**This is a scaffold, not a one-click import.** It cannot contain real webhook IDs, connection IDs,
or provider URLs, because those are account-specific and this agent was explicitly told not to
create or touch live Make.com scenarios/connections. See `setup-checklist.md` for what to fill in
after importing. Scenario 2 and 3 don't have their own blueprint files — they're simpler
(schedule → HTTP → iterator, no router fan-out) and are fully specified in their markdown files;
ask for a blueprint for either if a starting-point JSON would help.
