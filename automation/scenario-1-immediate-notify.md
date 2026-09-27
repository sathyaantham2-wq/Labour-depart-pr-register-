# Scenario 1 — Immediate Notify

Source: Automation tab, row 5 ("1. Immediate Notify"). Fires the moment a notice is generated in
the app (manual "Generate Notice" action, or Scenario 2's batch run — see that spec).

> **Update (post-launch):** email is no longer part of this scenario. `POST /api/notices` now
> sends the email directly (Resend, `src/lib/notices/email.ts`) and records the result *before*
> this webhook ever fires — no Make.com involvement for that channel at all. This scenario, and
> the webhook that triggers it, exist for **WhatsApp only** now. The original design (below,
> superseded) routed both channels through Make.com; it's kept in git history if that decision is
> ever revisited, but do not build against it — build against the contract in this file.

## Trigger

**Make.com: Custom Webhook** (app `gateway`, module `Custom webhook`).

The app's `POST /api/notices` handler creates the `notices` row + one `notice_deliveries` row per
party × channel that has a usable recipient, uploads the rendered DOCX, sends any email deliveries
directly and records their result, then — **only if the notice has at least one WhatsApp delivery**
AND `MAKE_WEBHOOK_URL` / `MAKE_WEBHOOK_SECRET` are set — mints a signed URL and POSTs to this
webhook with header `x-webhook-secret: <MAKE_WEBHOOK_SECRET>`. If a notice has no WhatsApp
deliveries at all (e.g. neither party has a WhatsApp number on file), the webhook is never called.

## Payload contract (current — WhatsApp only)

```jsonc
{
  "notice_id": "uuid",
  "case_id": "uuid",
  "hearing_id": "uuid | null",          // null for show_cause / closure / order notices
  "notice_type": "hearing | show_cause | closure | order",
  "doc_url": "https://...signed-url...",  // signed Storage URL, short-lived (7-day expiry)
  "whatsapp_template_name": "string | null", // Meta-approved template name from notice_templates
  "case": {
    "file_number": "string",
    "office_code": "string",
    "act": "string",
    "section_name": "string | null"
  },
  "hearing": {                           // present only when hearing_id is set
    "hearing_date": "YYYY-MM-DD",
    "hearing_time": "HH:MM | null"
  },
  "applicant": {                         // null if the case has no applicant party
    "id": "uuid",
    "name": "string",
    "whatsapp_phone": "string | null",   // E.164 — this payload only ever contains parties that
                                           // actually have a WhatsApp delivery pending; a party
                                           // with no whatsapp_phone on file is simply omitted
                                           // (see "No email fields" below)
    "preferred_language": "te | en | null",
    "whatsapp_delivery": { "delivery_id": "uuid" } | null
  },
  "management": { /* same shape as applicant, or null */ }
}
```

**No email fields.** `applicant.email` / `management.email` and any `deliveries.email.*` shape
do **not** exist in this payload. Email was already sent (or attempted and marked `failed`) by the
app before this webhook fired — do not build an Email module against this scenario, you would be
sending the same notice twice.

### Why `case` / `hearing` / `whatsapp_delivery` are here even though the Automation tab doesn't list them

Needed to fill WhatsApp template variables (file number, act, hearing date) and to let the
writeback call `POST /api/deliveries/callback` with `{delivery_id, ...}` — a single unambiguous
key — without Make.com reconstructing `(notice_id, party_id, channel)` itself or calling back into
the app mid-scenario for more context.

## Modules, in order

1. **Webhook** (`gateway:CustomWebHook`) — receives the payload above.
2. **Filter** — reject immediately if `{{1.headers.x-webhook-secret}}` ≠ the secret stored in this
   scenario (paste the same random value into both this scenario and the app's
   `MAKE_WEBHOOK_SECRET` — see `automation/setup-checklist.md`).
3. **Router** — two routes:
   - **Route A — Applicant**, filtered on `{{1.applicant.whatsapp_delivery}} exists`.
   - **Route B — Management**, filtered on `{{1.management.whatsapp_delivery}} exists`.
   (A party with no WhatsApp number on file, or no management party at all, simply has no route to
   take — nothing to configure for that beyond the filter above.)
4. **Inside each route:**
   - **HTTP module** → the WhatsApp Business API provider's send-template-message endpoint. Must
     use `whatsapp_template_name` (Meta-approved) — **never** free-text business-initiated messages
     (Automation tab rule + WhatsApp policy). Header = document → pass `doc_url` as the template's
     document-header media link. Body variables per `automation/whatsapp-templates.md`. Language =
     `party.preferred_language` (fallback `en` — Telugu templates are TBD, see that doc).
   - **Error handler** wraps the HTTP module (Make "Break"/ignore, not scenario-stop) so a 4xx/5xx
     from the provider still reaches the writeback step with `status: "failed"`.
   - **HTTP module → writeback**: `POST {APP_BASE_URL}/api/deliveries/callback` with header
     `x-webhook-secret`, body
     `{delivery_id: party.whatsapp_delivery.delivery_id, status: "sent"|"failed", provider_message_id, error}`.

Total: 1 webhook + 1 filter + 1 router + up to 2 (send + writeback) pairs = up to 5 action modules
for a notice going to both parties on WhatsApp. See `automation/README.md` for the updated
operations count (roughly half the original estimate, now that email isn't part of this flow).

## Filters (summary)

| Filter | Condition |
|---|---|
| Secret check | `headers.x-webhook-secret` == stored secret |
| Applicant route | `applicant.whatsapp_delivery` exists |
| Management route | `management.whatsapp_delivery` exists |

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
  written back.

## Data mapping reference

| Make.com field | Source |
|---|---|
| `to` (whatsapp) | `applicant.whatsapp_phone` / `management.whatsapp_phone` (E.164) |
| Template name | `whatsapp_template_name` from payload (already resolved by the app from `notice_templates`) |
| Template language | `applicant.preferred_language` / `management.preferred_language`, fallback `en` |
| Document header | `doc_url` (signed Storage URL) |
| Writeback key | `delivery_id` from `applicant.whatsapp_delivery` / `management.whatsapp_delivery` |
| Writeback status | `"sent"` on 2xx from provider, `"failed"` otherwise |
| Writeback `provider_message_id` | provider response's message/id field (varies by provider) |

## No double-sends

`notice_deliveries` unique `(notice_id, party_id, channel)` means a given notice can only ever have
one WhatsApp delivery row per party, and this scenario only ever receives one webhook call per
notice (fired once, by `POST /api/notices`, and only when a WhatsApp delivery exists). Email is
handled entirely outside this scenario now, so there is no risk of this scenario ever double-
sending an email regardless of how it's configured or replayed.
