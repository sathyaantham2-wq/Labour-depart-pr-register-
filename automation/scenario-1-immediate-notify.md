# Scenario 1 — Immediate Notify

Source: Automation tab, row 5 ("1. Immediate Notify"). Fires the moment a notice is generated in
the app (manual "Generate Notice" action, or Scenario 2's batch run — see that spec).

## Trigger

**Make.com: Custom Webhook** (app `gateway`, module `Custom webhook`).

The app's `POST /api/notices` handler creates the `notices` row + one `notice_deliveries` row per
party × channel that has a usable recipient, uploads the rendered DOCX, mints a signed URL, and —
only if `MAKE_WEBHOOK_URL` / `MAKE_WEBHOOK_SECRET` are set — POSTs to this webhook with header
`x-webhook-secret: <MAKE_WEBHOOK_SECRET>`.

## Payload contract

The Automation tab documents the shape as:

```
{notice_id, case_id, hearing_id, notice_type, signed doc_url, applicant, management, whatsapp_template_name}
```

This spec designs against that shape, with the sub-fields of `applicant` / `management` made
explicit below (the tab names the two objects but not their fields — see **Assumptions** for what
I filled in and why).

```jsonc
{
  "notice_id": "uuid",
  "case_id": "uuid",
  "hearing_id": "uuid | null",          // null for show_cause / closure / order notices
  "notice_type": "hearing | show_cause | closure | order",
  "doc_url": "https://...signed-url...",  // signed Storage URL, short-lived (e.g. 7-day expiry per Automation tab rules row 12)
  "whatsapp_template_name": "string | null", // Meta-approved template name from notice_templates
  "case": {                              // ASSUMPTION — see below
    "file_number": "string",
    "office_code": "string",
    "act": "string",
    "section_name": "string | null"
  },
  "hearing": {                           // ASSUMPTION — present only when hearing_id is set
    "hearing_date": "YYYY-MM-DD",
    "hearing_time": "HH:MM | null"
  },
  "applicant": {                         // null if the case has no applicant party (shouldn't happen, but don't assume)
    "party_id": "uuid",
    "name": "string",
    "email": "string | null",
    "whatsapp_phone": "string | null",   // E.164
    "preferred_language": "te | en | null",
    "deliveries": {                      // ASSUMPTION — see below
      "email": { "delivery_id": "uuid" } | null,
      "whatsapp": { "delivery_id": "uuid" } | null
    }
  },
  "management": { /* same shape as applicant, or null */ }
}
```

### Assumptions beyond the documented Automation tab shape

1. **`applicant` / `management` sub-fields.** The tab lists the two objects but not their
   contents. I designed them to carry exactly what a Router → Email/WhatsApp branch needs to send
   without Make.com having to call back into the app mid-scenario (which would need yet more
   authenticated endpoints). `party_id`, `name`, `email`, `whatsapp_phone`, `preferred_language`
   map 1:1 to the `parties` table.
2. **`deliveries.email.delivery_id` / `deliveries.whatsapp.delivery_id`.** Per the task brief,
   `POST /api/notices` already creates the `notice_deliveries` rows (one per party × channel)
   *before* it calls this webhook. That means the API already knows each row's `id` at webhook-send
   time. Handing Make.com those ids directly lets every writeback call `POST
   /api/deliveries/callback` with `{delivery_id, status, ...}` — a single unambiguous primary key —
   instead of Make.com reconstructing `(notice_id, party_id, channel)` from scratch. `null` here
   means "no delivery row for this channel" (e.g. the party has no email on file), which is exactly
   how the Router branches below decide whether to attempt that channel at all.
   **If the notice-api-engineer agent's implementation doesn't include this, flag it back** — see
   the top-level report for the concrete recommendation.
3. **`case` and `hearing` objects.** Needed to fill WhatsApp template variables and email
   subject/body (file number, act, hearing date) without a second authenticated call from Make.com.
   Not mentioned in the Automation tab at all; I added them because Scenario 1 cannot otherwise
   populate a template like "hearing on {{4}} for case {{2}}" (see
   `automation/whatsapp-templates.md`).

If the notice-api-engineer's actual payload omits any of the `case`/`hearing`/`deliveries` fields,
the Router/Email/WhatsApp modules below simply have nothing to map for that variable — decide then
whether to add the field server-side or have Make.com fetch it via a small `GET
/api/notices/:id` (not currently speced; flag as a missing endpoint if chosen).

## Modules, in order

1. **Webhook** (`gateway:CustomWebHook`) — receives the payload above.
2. **Filter** — reject immediately if `{{1.headers.x-webhook-secret}}` ≠ the secret stored in this
   scenario (Make.com has no way to read the app's `.env`; the same random value must be pasted
   into both places — see `automation/setup-checklist.md`). On reject, the webhook call still
   returns 200 to avoid leaking timing info to a prober; the run itself does nothing further.
3. **Router** — two routes:
   - **Route A — Applicant**, filtered on `{{1.applicant}} exists`.
   - **Route B — Management**, filtered on `{{1.management}} exists`.
   (A case can have zero recorded management parties; don't assume both always exist.)
4. **Inside each route, a second Router** splitting on channel:
   - **Email sub-route**, filtered on `{{party.deliveries.email.delivery_id}} exists`.
     - **HTTP module** → the Email provider's send API (see setup checklist for which provider).
       Minimal fields: `to = party.email`, `subject` built from `notice_type` + `case.file_number`,
       body links to `doc_url` (do not attach the DOCX as a raw file if avoidable — link to the
       signed URL so the mailbox doesn't need to store a copy of what's meant to live only in
       private Storage).
     - **Error handler** wraps the HTTP module (Make "Break"/ignore, not scenario-stop) so a 4xx/5xx
       from the provider still reaches the writeback step below with `status: "failed"`.
     - **HTTP module → writeback**: `POST {APP_BASE_URL}/api/deliveries/callback` with header
       `x-webhook-secret`, body `{delivery_id: party.deliveries.email.delivery_id, status: "sent"|"failed", provider_message_id, error}`.
   - **WhatsApp sub-route**, filtered on `{{party.deliveries.whatsapp.delivery_id}} exists`.
     - **HTTP module** → the WhatsApp Business API provider's send-template-message endpoint.
       Must use `whatsapp_template_name` (Meta-approved) — **never** free-text business-initiated
       messages (Automation tab rule + WhatsApp policy). Header = document → pass `doc_url` as the
       template's document-header media link. Body variables per
       `automation/whatsapp-templates.md`. Language = `party.preferred_language` (fallback `en` —
       Telugu templates are TBD, see that doc).
     - Same error-handler + writeback pattern as email, targeting
       `party.deliveries.whatsapp.delivery_id`.

Total: 1 webhook + 1 filter + 1 router + 2 sub-routers + up to 4 (send + writeback) pairs = up to
8 action modules for a notice going to both parties on both channels. See `automation/README.md`
for the Make.com operations count this implies.

## Filters (summary)

| Filter | Condition |
|---|---|
| Secret check | `headers.x-webhook-secret` == stored secret |
| Applicant route | `applicant` exists |
| Management route | `management` exists |
| Email sub-route (either party) | `deliveries.email.delivery_id` exists (i.e. party has an email on file) |
| WhatsApp sub-route (either party) | `deliveries.whatsapp.delivery_id` exists (i.e. party has a WhatsApp E.164 number on file) |

## Error handling

- Provider HTTP call fails (network/4xx/5xx/timeout) → caught by the module's error handler →
  writeback still fires with `status: "failed"`, `error` = provider's error message/body
  (truncated to a sane length, e.g. 500 chars, before sending — don't forward a raw HTML error
  page into a text column).
- Writeback call itself fails (app down, wrong secret after rotation, etc.) → Make.com's own
  scenario error history captures it; this is the one failure mode where `notice_deliveries` will
  *not* reflect reality until Scenario 3 (Retry Failed) or a manual re-run picks it up. Consider
  enabling Make's "Incomplete Executions" (paid-plan data store of failed runs you can resume) so a
  writeback-call failure isn't silently lost.
- Secret mismatch on the inbound webhook → scenario ends at the filter; nothing is sent, nothing is
  written back (there's nothing to update — the request wasn't a legitimate notice event).

## Data mapping reference

| Make.com field | Source |
|---|---|
| `to` (email) | `applicant.email` / `management.email` |
| `to` (whatsapp) | `applicant.whatsapp_phone` / `management.whatsapp_phone` (E.164) |
| Template name | `whatsapp_template_name` from payload (already resolved by the app from `notice_templates`) |
| Template language | `applicant.preferred_language` / `management.preferred_language`, fallback `en` |
| Document header / attachment | `doc_url` (signed Storage URL) |
| Writeback key | `delivery_id` (preferred) — see Assumption 2 above |
| Writeback status | `"sent"` on 2xx from provider, `"failed"` otherwise |
| Writeback `provider_message_id` | provider response's message/id field (varies by provider — map per whichever is chosen) |

## No double-sends

This scenario does not need its own dedupe logic: `notice_deliveries` unique `(notice_id,
party_id, channel)` means a given notice can only ever have one delivery row per party × channel,
and this scenario only ever receives one webhook call per notice (fired once, by `POST
/api/notices`, at creation time). If the webhook is somehow replayed (e.g. Make.com's own retry of
a failed inbound delivery), the second run's HTTP send to the provider is **not** automatically
deduped by Make — that's on the provider/DB combination: the writeback's `PATCH`-like update to an
already-`sent` row is harmless (idempotent overwrite), but a true double-send of the *message
itself* on replay is a known limitation the user should be aware of. Make.com's Custom Webhook
module does not itself replay deliveries once acknowledged, so this is a low-probability edge case
in practice.
