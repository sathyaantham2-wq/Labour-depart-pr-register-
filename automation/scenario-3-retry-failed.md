# Scenario 3 — Retry Failed

Source: Automation tab, row 7. Retries deliveries stuck at `status = 'failed'` up to 3 attempts,
then escalates to the assigned officer for manual (postal/hand) service.

> **Update (post-launch): this scenario is now WhatsApp-only.** Email is sent directly by the app
> (Resend), not through Make.com, so Make.com has no send credentials or code path for email at
> all and cannot retry a failed email delivery — reusing Scenario 1's (removed) email sub-route
> here is no longer possible or correct. Failed **email** deliveries need a retry mechanism owned
> by the app itself instead (not built as of this note — options: a small Supabase Edge Function
> retrying via Resend directly, mirroring `supabase/functions/due-hearings/`, or a manual "Retry"
> button on the Notice History screen calling a new endpoint that re-runs the same
> `sendNoticeEmail()` call already in `src/app/api/notices/route.ts`). Steps 5 and 6 below are
> updated for WhatsApp only; step 7's escalation logic still applies to whichever channel actually
> failed 3 times, WhatsApp or email, once an email retry path exists.

## Trigger

**Make.com: Schedule** module, daily **14:00 Asia/Kolkata** (per the tab's suggested cadence), OR a
manual **"Retry" button** in the app UI (out of scope for this agent — flagged below).

## Modules, in order

1. **Schedule** (or webhook, if a manual retry-button trigger is added — see gap below) — 14:00 IST
   daily.
2. **HTTP module → Supabase** (via PostgREST, not a bespoke Edge Function — this query is a plain
   filtered select, not the multi-table "due" logic Scenario 2 needed, so a dedicated Edge Function
   isn't justified here). **Filtered to `channel=eq.whatsapp`** — this scenario no longer touches
   email deliveries at all (see the update note above):
   ```
   GET {SUPABASE_URL}/rest/v1/notice_deliveries
     ?status=eq.failed
     &attempt_count=lt.3
     &channel=eq.whatsapp
     &select=id,notice_id,party_id,channel,recipient,attempt_count,
             notices(doc_path,type,case_id,hearing_id),
             parties(name,whatsapp_phone,preferred_language)
   ```
   Header `apikey` / `Authorization: Bearer <service_role key>` — **this call needs the Supabase
   service role key inside a Make.com HTTP module/connection, not a new endpoint in the Next.js
   app.** That's consistent with the brief's "the Supabase service role key lives only in Make.com
   connections / env" rule. Store it as a Make.com **Connection** (HTTP with API key auth), not
   pasted into a raw HTTP module string, so it doesn't appear in plaintext in scenario exports or
   execution history.
   **Gap**: `notices.doc_path` is a private Storage path, not a usable URL — this query alone
   cannot produce a fresh signed URL (Storage signed-URL minting needs the service role key doing a
   Storage API call, which PostgREST doesn't expose). See step 3.
3. **HTTP module → mint a fresh signed URL**: `POST
   {SUPABASE_URL}/storage/v1/object/sign/{bucket}/{doc_path}` (Supabase Storage's own signed-URL
   endpoint) with the same service-role auth, `{"expiresIn": 604800}` (7 days, matching the
   Automation tab's rules row). Do this **per delivery being retried**, not once — the whole point
   of retry is the original signed URL may have already expired.
4. **Iterator** over the failed-deliveries array from step 2 (all WhatsApp, per the filter above —
   no Router needed to split by channel any more).
5. **HTTP module** → the WhatsApp Business API provider's send-template-message endpoint, reusing
   the exact same module and body mapping as Scenario 1's WhatsApp route (see
   `automation/scenario-1-immediate-notify.md`), pointed at the fresh signed URL from step 3
   instead of a payload-provided `doc_url`.
6. **Writeback**: `POST {APP_BASE_URL}/api/deliveries/callback`, header `x-webhook-secret`, body
   `{delivery_id, status: "sent"|"failed", provider_message_id, error}`.
   **Recommendation to notice-api-engineer**: have the callback endpoint increment
   `attempt_count` server-side by 1 on every write to `notice_deliveries`, rather than expecting
   Make.com to compute and pass the new count. This keeps the counter authoritative in one place
   (avoids a race if two scenario runs somehow overlap) and means Scenario 1's writeback (which
   also touches `attempt_count`, going from 0 → 1 on the very first attempt) and Scenario 3's don't
   need different body shapes.
7. **After the 3rd failure** — i.e., this retry attempt's response comes back `failed` and the
   *pre-retry* `attempt_count` was already 2 (so this was attempt 3): send an email to the case's
   `assigned_officer_id` (join `cases.assigned_officer_id -> profiles.email`) saying "serve by post
   / hand" for that party + channel, including the case file number and party name. This is a
   **plain transactional email**, not a WhatsApp template — no Meta approval needed.
   **Gap**: there is currently no endpoint to look up `profiles.email` from `assigned_officer_id`
   by service-role/Make.com other than a raw PostgREST `GET
   {SUPABASE_URL}/rest/v1/profiles?id=eq.{id}&select=email`, which works today (profiles table
   already exists) — no new endpoint needed, just note it as another direct-PostgREST call
   alongside step 2/3, all under the same service-role Make.com connection.

## Filters

| Filter | Condition |
|---|---|
| Eligible for retry | `notice_deliveries.status = 'failed'` AND `attempt_count < 3` |
| Escalate instead of retry | (computed after this attempt) new `status = 'failed'` AND pre-retry `attempt_count = 2` (this was the 3rd try) |

## Error handling

- Signed-URL minting (step 3) fails → skip that delivery for this run (log it), it'll be picked up
  again on the next day's run since its `status` is still `failed` and `attempt_count` unchanged.
- Provider send fails again → writeback with `status: "failed"`, `error` set, `attempt_count`
  incremented as above; on the 3rd such failure, the escalation email fires per step 7.
- Escalation email itself fails to send → this is a genuine operational alert; let it surface in
  Make.com's own scenario failure notifications rather than silently swallowing it — a failed
  escalation means a party may never get served at all through this system.

## No double-sends / no double-escalation

- The `attempt_count < 3` filter is the only gate needed — once a delivery reaches 3 failed
  attempts and the escalation email has fired, it naturally drops out of this scenario's query
  (attempt_count is no longer `< 3`), so it won't retry or re-escalate on subsequent days. There is
  **no separate "escalated" flag** in the schema; if the office wants to avoid a *second* escalation
  email in the edge case where attempt_count is manually reset (e.g. an admin manually resets a
  delivery to `pending` after re-establishing contact with a party), that's a manual action outside
  this scenario's scope and inherently resets the retry clock, which is the intended behavior for a
  manual override.
- Unique `(notice_id, party_id, channel)` on `notice_deliveries` still guarantees this scenario is
  only ever retrying pre-existing rows, never creating new ones — retry never generates a new
  notice or delivery row, only updates an existing one.

## Gap: manual "Retry" button in the app UI

The Automation tab's trigger column says "Daily schedule ... **or Retry button**". A UI-triggered
retry (single delivery, on demand) is a `frontend-builder` + `notice-api-engineer` concern (a button
that calls some endpoint), not something this scenario's daily schedule covers. Two ways to wire it,
neither of which exists yet — **flag both as options for the other agents**:
- **A**: The app calls the same provider APIs directly server-side (bypassing Make.com entirely for
  the on-demand case) — simplest, but duplicates the send logic Make.com owns for the scheduled
  path.
- **B**: The app POSTs to a second Make.com webhook (a 4th "on-demand retry" trigger, separate from
  this scenario's daily schedule but sharing steps 2 onward) with `{delivery_id}` in the body, and
  this scenario's steps 2-7 run for just that one row instead of the whole `attempt_count < 3` set.
  This keeps all provider-send logic in one place (Make.com) at the cost of one more webhook to
  configure.
This spec doesn't pick one — it's a cross-agent decision (touches `src/app` UI) outside this
agent's scope per the brief.
