# WhatsApp Message Templates (Meta / Business API)

Drafts for the four `notices.type` values (`hearing`, `show_cause`, `closure`, `order`). These are
**business-initiated** messages, so per WhatsApp policy every one of them **must** be a
Meta-approved template — free-text is not permitted outside a user-initiated 24-hour session
window (Automation tab rules row 11 says the same).

## Format notes (Meta template rules, applied consistently below)

- **Category**: `UTILITY` for all four — these are transactional/procedural notices about an
  existing case, not marketing. (Meta's own category guidance separates "Utility" — order updates,
  appointment reminders, account alerts — from "Marketing"; a hearing/show-cause/closure/order
  notice fits Utility, not Marketing, and Utility templates have a lower approval bar and are not
  subject to marketing-template pacing/opt-out rules.)
- **Header**: `DOCUMENT` for all four, per the brief — the header carries the generated notice DOCX
  itself (or a PDF, if that open decision resolves to PDF) as the attached document. Media headers
  don't take `{{n}}` variables — the actual file is supplied at send time as a document ID/link by
  the WhatsApp provider's send-message API, using the notice's signed `doc_url`.
- **Body**: numbered variables `{{1}}, {{2}}, ...` used sequentially, no skipped numbers (a Meta
  submission requirement). Each variable needs an example value at submission time — examples are
  given below.
- **Footer**: static text only — **no variables allowed in a footer** by Meta's template spec.
  Kept short and identical across all four for consistency.
- **Buttons**: omitted for v1. If a "Call office" quick-reply or phone button is wanted later,
  that's an additive change (doesn't require restructuring the body).
- **Language**: WhatsApp templates are versioned per language as a separate template *component*
  under the same template name, or as an entirely separate template name — provider UIs vary
  (Gupshup/360dialog/Twilio all submit to Meta slightly differently). Confirm the mechanism with
  whichever provider is chosen; this doc treats English (`en`) and Telugu (`te`) as two rows per
  notice type either way.

## Compliance flag — read before submitting any of these

These messages go to **parties to a labour dispute** (applicants and management), not to customers
who opted into marketing from a business. WhatsApp's messaging policy still requires the business
to have a valid basis to message the number (the party gave their number to the department as part
of the case record, which is a defensible basis for a utility/service notice, but this is a policy
judgment call, not a technical one). **Confirm with the chosen WhatsApp provider and/or the
department's own legal position that serving a statutory notice over WhatsApp — alongside the
notice's canonical form (post/hand/DOCX) — is acceptable, before submitting templates for Meta
approval.** This is flagged, not decided, here — outside this agent's authority per `CLAUDE.md`'s
open-decisions rule.

---

## 1. `hearing` — Hearing Notice

**Template name**: `hearing_notice`

### English (`en`)

| Field | Value |
|---|---|
| Category | UTILITY |
| Header | Document |
| Body | `Dear {{1}}, this is to inform you that a hearing in case {{2}} ({{3}}) has been scheduled on {{4}} at {{5}}. Please find the attached notice for full details. Non-appearance may result in ex-parte proceedings as per applicable rules.` |
| Body variable examples | `{{1}}` Sri Ramesh Kumar · `{{2}}` EC/45/2026 · `{{3}}` Employees' Compensation Act · `{{4}}` 15-10-2026 · `{{5}}` 11:00 AM |
| Footer | Office of the Labour Officer — this is an automated notice |

### Telugu (`te`)

**TBD — needs review by a Telugu speaker before submission to Meta.** Telugu notices are an open
decision (Overview tab, item 2: "Are notices bilingual (Telugu + English)?"). Do not fill this row
with a machine translation of the English body — a mistranslated statutory notice is a real harm to
a party who may rely on it to know when/where to appear. Once the language decision is made and a
Telugu speaker (ideally departmental staff, not this agent) reviews a translation, fill this row
with the same table shape as above (category/header/body/variable examples/footer), and it can go
to Meta for approval alongside the English version.

---

## 2. `show_cause` — Show Cause Notice

**Template name**: `show_cause_notice`

### English (`en`)

| Field | Value |
|---|---|
| Category | UTILITY |
| Header | Document |
| Body | `Dear {{1}}, in case {{2}} ({{3}}), you are required to show cause in writing within {{4}} days from the date of this notice, failing which further action will be taken as per applicable rules. Please find the attached notice for full details.` |
| Body variable examples | `{{1}}` M/s ABC Enterprises · `{{2}}` ID/12/2026 · `{{3}}` Industrial Disputes Act · `{{4}}` 15 |
| Footer | Office of the Labour Officer — this is an automated notice |

### Telugu (`te`)

**TBD — needs review by a Telugu speaker before submission to Meta.** Same caveat as above.

---

## 3. `closure` — Case Closure Notice

**Template name**: `closure_notice`

### English (`en`)

| Field | Value |
|---|---|
| Category | UTILITY |
| Header | Document |
| Body | `Dear {{1}}, this is to inform you that case {{2}} ({{3}}) has been closed on {{4}}. Please find the attached closure order for your records.` |
| Body variable examples | `{{1}}` Smt. Lakshmi Devi · `{{2}}` SE/78/2026 · `{{3}}` Shops & Establishments Act · `{{4}}` 20-09-2026 |
| Footer | Office of the Labour Officer — this is an automated notice |

### Telugu (`te`)

**TBD — needs review by a Telugu speaker before submission to Meta.** Same caveat as above.

---

## 4. `order` — Order Notice

**Template name**: `order_notice`

### English (`en`)

| Field | Value |
|---|---|
| Category | UTILITY |
| Header | Document |
| Body | `Dear {{1}}, an order has been passed in case {{2}} ({{3}}) on {{4}}. Please find the attached order for full details. Any compliance required under this order must be completed within the period specified therein.` |
| Body variable examples | `{{1}}` Sri Ramesh Kumar · `{{2}}` EC/45/2026 · `{{3}}` Employees' Compensation Act · `{{4}}` 25-09-2026 |
| Footer | Office of the Labour Officer — this is an automated notice |

### Telugu (`te`)

**TBD — needs review by a Telugu speaker before submission to Meta.** Same caveat as above.

---

## Variable mapping back to the webhook payload

Per `automation/scenario-1-immediate-notify.md`'s payload design:

| Template variable (all 4 types) | Source |
|---|---|
| `{{1}}` (recipient name) | `applicant.name` or `management.name` |
| `{{2}}` (file number) | `case.file_number` |
| `{{3}}` (act) | `case.act` |
| `{{4}}` (date — hearing date / deadline / closure date / order date) | `hearing.hearing_date` for `hearing` type; a notice-type-specific date not currently in the payload for `show_cause`/`closure`/`order` — **gap**: the payload as designed only carries `hearing` data when `hearing_id` is set. `show_cause`/`closure`/`order` notices need at minimum a relevant date (deadline / closure date / order date) added to the payload's `case` or a new `notice`-scoped object — flag to notice-api-engineer if not already planned. |
| `{{5}}` (hearing time, `hearing` type only) | `hearing.hearing_time` |

## Submission checklist per template (do this once per language, per provider)

1. Create the template in the chosen provider's dashboard (Gupshup / 360dialog / Twilio all proxy
   submission to Meta).
2. Set category `UTILITY`, header type `Document`, paste body text with `{{n}}` placeholders exactly
   as above, add the example values, add the footer.
3. Submit for Meta review (typically hours, sometimes longer for a first-time WhatsApp Business
   Account).
4. Once approved, copy the exact approved template **name** into the corresponding
   `notice_templates.whatsapp_template_name` row in the app's database (admin-only screen /
   direct DB edit — this is a `db-architect`/`frontend-builder` concern for the admin UI, not
   this agent's).
