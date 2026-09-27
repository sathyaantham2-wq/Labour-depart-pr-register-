# Scenario 2 — Batch/Scheduled Notify

Source: Automation tab, row 6. Runs daily (e.g. 9:00 AM IST) and notifies both parties for every
upcoming hearing that hasn't been notified yet.

> **Update (post-launch):** this scenario still calls `POST /api/notices` exactly as designed below
> — no change needed here. But that endpoint now sends email directly (Resend) and only fires the
> Scenario 1 webhook for WhatsApp deliveries. So "notifies both parties" below means: email goes out
> the moment this scenario calls the endpoint (synchronously, before it even responds), and WhatsApp
> goes out via the Scenario 1 chain as before, if the notice has any WhatsApp deliveries.

## Trigger

**Make.com: Schedule** module, daily, **09:00 Asia/Kolkata** (set the scenario's scheduling
timezone to `Asia/Kolkata` explicitly in Make.com — don't rely on the account default, which may be
UTC).

## Design decision: reuse Scenario 1 instead of duplicating the send logic

The Automation tab's step 5 for this scenario says "Email + WhatsApp to both parties (same as
Scenario 1)". Rather than copy Scenario 1's Router/Email/WhatsApp/writeback modules a second time
into this scenario (double the modules to maintain, double the chance the two copies drift), this
scenario's job stops at **creating the notice** via the same `POST /api/notices` the app itself
uses for a manual "Generate Notice" click. That endpoint already (per its brief) fires the
`MAKE_WEBHOOK_URL` webhook after creating the notice + delivery rows — which is exactly Scenario 1's
trigger. So calling it from here causes Scenario 1 to run and do the actual sending, for free, with
zero duplicated logic.

**If you'd rather each scenario be fully self-contained (easier to read in isolation, at the cost
of duplicated modules and double the maintenance surface), copy Scenario 1's Router onward into
this scenario's step 5 instead of relying on the webhook chain.** Either is a legitimate choice;
this doc assumes the reuse approach because it's what the Rules & notes row about a single
dedupe mechanism (`idempotency_key`) implies the design intends — one code path creates notices,
one code path sends them.

## Modules, in order

1. **Schedule** — daily 09:00 IST.
2. **HTTP module → Supabase Edge Function**: `GET {SUPABASE_URL}/functions/v1/due-hearings?days=3`
   with header `x-webhook-secret: <DUE_HEARINGS_SECRET>` (a **separate** secret from
   `MAKE_WEBHOOK_SECRET` — see `supabase/functions/due-hearings/index.ts` header comment for why).
   Returns a JSON array of due hearings (see that function's response shape below).
3. **Iterator** (Make `builtin:BasicIterator`) over the array returned in step 2.
4. **Per hearing — HTTP module → `POST {APP_BASE_URL}/api/notices`**:
   ```json
   { "case_id": "{{3.case_id}}", "notice_type": "hearing", "hearing_id": "{{3.id}}" }
   ```
   with header `x-webhook-secret: <MAKE_WEBHOOK_SECRET>` (this endpoint is the app's own API, same
   secret convention as the deliveries callback — confirm with notice-api-engineer that
   `/api/notices` is in fact gated the same way; if it's only session-auth-gated today, that's a
   gap to flag, since Make.com has no user session).
   The endpoint is expected to set `idempotency_key = hearing_id || ':hearing'`, so a hearing that
   somehow appears twice in one run (or across two runs before the notice fully sends) causes a
   unique-constraint conflict on the second attempt rather than a duplicate notice. **Treat a 409 /
   unique-violation response from this call as a success-no-op, not an error** — log it, don't
   retry, don't alert.
5. **Aggregate results** (Make `builtin:ArrayAggregator` over the iterator) collecting
   `{case_id, hearing_id, http_status}` for the optional digest step.
6. **Optional — Admin/Head summary digest** (see below).

## Data source: what counts as "due"

Delegated entirely to the Edge Function (`supabase/functions/due-hearings/index.ts`) rather than
expressed as Make.com filters, per the task brief ("have the scenario spec call it, rather than
having Make.com itself run complex SQL logic"). The function's contract:

- **Request**: `GET /functions/v1/due-hearings?days=N` (N optional, default **3** — see the
  function file's header comment for why 3), header `x-webhook-secret: <DUE_HEARINGS_SECRET>`.
- **Response** `200`:
  ```jsonc
  [
    {
      "id": "uuid",              // hearings.id
      "case_id": "uuid",
      "hearing_date": "YYYY-MM-DD",
      "hearing_time": "HH:MM:SS | null",
      "file_number": "string",   // joined from cases, for the digest email / debugging
      "office_code": "string"
    }
  ]
  ```
- **Definition of "due"**: `hearings.status = 'scheduled'` AND `hearing_date` between today and
  today + N days (IST) inclusive, AND there is no `notices` row with that `hearing_id`, `type =
  'hearing'`, and `status` in `('sent', 'partial')`. A hearing whose only notice attempt `failed`,
  or that has no notice row at all, is still due — that's what makes this idempotent-safe to run
  daily without spamming parties who already got their notice.

## No double-sends

This scenario relies entirely on the two DB-level dedupe mechanisms already in place — it does
**not** invent its own:

1. `notices.idempotency_key` (unique) stops `POST /api/notices` from creating a second `notices`
   row for the same `hearing_id` + `hearing` type if this scenario (or a manual click) already
   created one today or on a prior run.
2. The Edge Function's own "due" definition stops the *same hearing* from being queued a second
   time once its notice reaches `sent`/`partial` — so even before hitting the idempotency key, most
   already-handled hearings never appear in the batch at all.

Between these two, Scenario 2 can be re-run manually (e.g. after a Make.com outage) without a
manual dedupe pass — worst case it re-attempts hearings still stuck in a `failed` notice state,
which is the intended retry-by-rerun behavior.

## Missing / gap to flag: `template_id`

`POST /api/notices`'s documented body is `{case_id, notice_type, hearing_id?, template_id}` —
**`template_id` is required**, but this scenario's only inputs (from the Edge Function) are
`case_id` and `hearing_id`. Neither this scenario nor the Edge Function has a good way to pick the
right `notice_templates` row: template choice depends on `notice_type` (`hearing`, fixed here) and
`language`, and language is a **per-party** preference (`parties.preferred_language`) — but a
`notices` row references exactly one `template_id`, i.e. one language, for both parties.

**Recommendation to notice-api-engineer**: make `template_id` optional on `POST /api/notices`, and
when omitted, resolve it server-side against `notice_templates` filtered on `notice_type` + `active
= true`:
- If exactly one active template matches, use it.
- If more than one matches (e.g. both `te` and `en` active for the same `notice_type` once Telugu
  ships), return `400` with a clear error — don't guess a language for a legal notice. At that
  point Scenario 2 (or the office) needs an explicit default-language setting, which isn't
  currently modeled anywhere (not in `notice_templates`, not per-office) — flag that as a further
  open item if/when Telugu ships.

This spec assumes that resolution happens API-side; if notice-api-engineer instead keeps
`template_id` required, this scenario cannot function as designed and the Edge Function would need
to grow a `notice_templates` join it doesn't currently have (undesirable — it doesn't know which
language to prefer either).

## Optional: Admin/Head summary digest

The Automation tab lists this as optional. Because `POST /api/notices` in step 4 only confirms the
notice was *created*, not that it *sent* (sending happens asynchronously via Scenario 1's own
webhook-triggered run), an accurate sent/failed count isn't available synchronously at the end of
this run. Two options, pick one:

- **A (recommended for v1): skip the digest entirely.** The Dashboard/notice list in the app is
  the source of truth for delivery status; a daily email digest duplicates that with a staleness
  problem baked in.
- **B: delayed digest.** Add a Make `Sleep` module (e.g. 5 minutes) after step 4's iterator
  completes, then one more HTTP call — but there is **no existing endpoint** for "notice_deliveries
  created since time X, grouped by status." This would need a new small aggregate endpoint or
  Supabase view (e.g. `GET /api/notices/batch-summary?since=...`), which does not currently exist —
  **flag as a missing endpoint if the user wants option B.**

## Error handling

- Edge Function call (step 2) fails (5xx, timeout, wrong secret) → scenario should stop and alert
  (Make.com's built-in scenario failure notification, or a dedicated error-handler route emailing
  the admin) — don't silently skip a whole day's batch.
- Per-hearing `POST /api/notices` call (step 4) fails with anything other than a 409/unique-conflict
  → log and continue the iterator (don't let one bad case_id stop the rest of the day's hearings).
  Make's Iterator + per-branch error handler (Resume) achieves this.
