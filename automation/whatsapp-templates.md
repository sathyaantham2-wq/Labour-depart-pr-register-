# WhatsApp Message Templates (Meta / Business API)

> **Status: English only — decided.** The "bilingual notices" open decision (Overview tab) is
> resolved as English-only; Telugu is not needed. The Telugu drafts below are kept for reference
> only (they were AI-assisted and never reviewed) — do not build on them or activate them.

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

### Telugu (`te`) — DRAFT, unreviewed

> ⚠️ **AI-assisted draft translation. Not reviewed by a native Telugu speaker or anyone with legal/
> administrative Telugu drafting experience. Do not submit to Meta or send to a real party until a
> departmental staff member with strong Telugu has checked it line by line.** Specific things to
> double-check: the legal term for "ex-parte proceedings" (kept as an English loanword in
> parentheses below, which is common practice in Telugu legal notices, but confirm the department's
> preferred phrasing), and the office designation in the footer (kept generic — substitute the
> actual designated officer's title used in your notices).

| Field | Value |
|---|---|
| Category | UTILITY |
| Header | Document |
| Body | `గౌరవనీయులైన {{1}} గారికి, కేసు {{2}} ({{3}})లో విచారణ తేదీ {{4}}, సమయం {{5}}గా నిర్ణయించబడినదని తెలియజేయడమైనది. పూర్తి వివరాల కోసం జతచేసిన నోటీసును పరిశీలించగలరు. వర్తించు నిబంధనల మేరకు హాజరుకానిచో ఏకపక్ష (ఎక్స్‌పార్టీ) చర్యలు చేపట్టబడే అవకాశం కలదు.` |
| Body variable examples | `{{1}}` శ్రీ రమేష్ కుమార్ · `{{2}}` EC/45/2026 · `{{3}}` Employees' Compensation Act · `{{4}}` 15-10-2026 · `{{5}}` ఉదయం 11:00 గంటలకు |
| Footer | కార్మిక శాఖ అధికారి కార్యాలయం — ఇది స్వయంచాలక నోటీసు |

Notes on choices made: Act names (`{{3}}`) are kept in English even in the Telugu body — this
mirrors how Indian regional-language legal notices conventionally cite an Act by its officially
notified (English) short title rather than translating it, avoiding any ambiguity about which law
is meant. Dates are left in the same `DD-MM-YYYY` format the app already produces (not translated
to a different calendar or numeral style) since the actual value substituted at send time comes
from `formatDateIST()`, unchanged regardless of template language.

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

### Telugu (`te`) — DRAFT, unreviewed

> ⚠️ Same caveat as the hearing notice above — **not reviewed, do not submit or send until checked**
> by a native Telugu speaker. Specific term to double-check: "show cause" (rendered below as
> "కారణాలు తెలియజేయవలసినది" — literally "required to state reasons" — confirm this matches the
> department's standard phrasing for a show-cause notice, if one already exists in other official
> correspondence).

| Field | Value |
|---|---|
| Category | UTILITY |
| Header | Document |
| Body | `గౌరవనీయులైన {{1}} గారికి, కేసు {{2}} ({{3}})కు సంబంధించి, ఈ నోటీసు తేదీ నుండి {{4}} రోజులలోపు లిఖితపూర్వకంగా కారణాలు తెలియజేయవలసినదిగా కోరడమైనది; తప్పినచో వర్తించు నిబంధనల మేరకు తదుపరి చర్యలు చేపట్టబడతాయి. పూర్తి వివరాల కోసం జతచేసిన నోటీసును పరిశీలించగలరు.` |
| Body variable examples | `{{1}}` మె. ఎబిసి ఎంటర్‌ప్రైజెస్ · `{{2}}` ID/12/2026 · `{{3}}` Industrial Disputes Act · `{{4}}` 15 |
| Footer | కార్మిక శాఖ అధికారి కార్యాలయం — ఇది స్వయంచాలక నోటీసు |

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

### Telugu (`te`) — DRAFT, unreviewed

> ⚠️ Same caveat — **not reviewed, do not submit or send until checked** by a native Telugu speaker.

| Field | Value |
|---|---|
| Category | UTILITY |
| Header | Document |
| Body | `గౌరవనీయులైన {{1}} గారికి, కేసు {{2}} ({{3}}) {{4}} తేదీన మూసివేయబడినదని తెలియజేయడమైనది. మీ రికార్డుల కొరకు జతచేసిన మూసివేత ఉత్తర్వును పరిశీలించగలరు.` |
| Body variable examples | `{{1}}` శ్రీమతి లక్ష్మీదేవి · `{{2}}` SE/78/2026 · `{{3}}` Shops & Establishments Act · `{{4}}` 20-09-2026 |
| Footer | కార్మిక శాఖ అధికారి కార్యాలయం — ఇది స్వయంచాలక నోటీసు |

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

### Telugu (`te`) — DRAFT, unreviewed

> ⚠️ Same caveat — **not reviewed, do not submit or send until checked** by a native Telugu speaker.
> Specific term to double-check: "compliance" (rendered below as "అనుసరణ (కంప్లయెన్స్)" — a Telugu
> gloss plus the English loanword in parentheses, a common pattern in Telugu administrative
> writing for a term with no single settled Telugu equivalent — confirm the department's preference).

| Field | Value |
|---|---|
| Category | UTILITY |
| Header | Document |
| Body | `గౌరవనీయులైన {{1}} గారికి, కేసు {{2}} ({{3}})లో {{4}} తేదీన ఉత్తర్వు జారీ చేయబడినది. పూర్తి వివరాల కోసం జతచేసిన ఉత్తర్వును పరిశీలించగలరు. ఈ ఉత్తర్వు ప్రకారం అవసరమైన అనుసరణ (కంప్లయెన్స్) చర్యలను అందులో పేర్కొన్న గడువులోపు పూర్తి చేయవలసి ఉంటుంది.` |
| Body variable examples | `{{1}}` శ్రీ రమేష్ కుమార్ · `{{2}}` EC/45/2026 · `{{3}}` Employees' Compensation Act · `{{4}}` 25-09-2026 |
| Footer | కార్మిక శాఖ అధికారి కార్యాలయం — ఇది స్వయంచాలక నోటీసు |

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
