# Automation Setup Checklist

A concrete, ordered list of what **you** (not this agent — no live Make.com/WhatsApp/email
configuration was touched while producing these specs) need to click through once you have a
WhatsApp Business API provider account. Cross-reference: `Labour_Portal_Full_Development_Plan.xlsx`
Setup Checklist tab items 1–4, 12–14 cover the same ground at a higher level; this is the
automation-specific detail under those items.

## 0. Prerequisites (do these first if not already done — Setup Checklist tab items 1–3)

- [ ] Sign up with a WhatsApp Business API provider: **Gupshup**, **360dialog**, or **Twilio**.
- [ ] Complete Meta Business verification for the department under that provider.
- [ ] Have the provider's API base URL and an API key/token ready (needed in step 4 below).

## 1. Submit WhatsApp templates for approval

- [ ] Open `automation/whatsapp-templates.md`.
- [ ] For each of the 4 English templates (`hearing_notice`, `show_cause_notice`,
      `closure_notice`, `order_notice`), create the template in your provider's dashboard using the
      exact category/header/body/footer given there, with the example values filled in.
- [ ] **Do not submit Telugu templates yet** — that section is intentionally left `TBD`. Come back
      to this step once (a) the bilingual-notices decision is made and (b) a Telugu speaker has
      reviewed a translation. Submitting an unreviewed machine translation of a government notice
      to Meta is explicitly what this agent was told not to do on your behalf.
- [ ] Once each template is Meta-approved, copy its exact approved name into
      `notice_templates.whatsapp_template_name` for the matching row (admin DB edit or an admin
      screen, once that exists — not built by this agent).

## 2. Create Make.com account and connections (Setup Checklist tab items 9, 12, 13)

- [ ] Create a Make.com account; choose a plan against the operations estimate in
      `automation/README.md` (start around ~3,000 ops/month for a light rollout, budget toward
      ~11,000 ops/month if volume grows — check Make's current pricing tiers, they change).
- [ ] **Make.com > Connections > Add** — connect your chosen WhatsApp provider (Gupshup / 360dialog
      / Twilio). If the provider isn't a native Make.com app, use a generic **HTTP with API key**
      connection instead (this is what the provided blueprint assumes — see
      `automation/README.md`'s note on generic HTTP modules).
- [ ] **Make.com > Connections > Add** — connect an email-sending service (SendGrid, Postmark,
      Resend, Amazon SES, etc.). Set up SPF/DKIM on your sending domain per that provider's
      instructions (Setup Checklist tab item 13 flags this explicitly — without it, notice emails
      are likely to land in spam).

## 3. Import the Scenario 1 blueprint

- [ ] In Make.com, **Create a new scenario > Import Blueprint**, and upload
      `automation/blueprints/scenario-1-immediate-notify.blueprint.json`.
- [ ] The import will likely ask you to reconnect the webhook trigger module — create a new Custom
      Webhook in that dialog (Make.com generates the actual webhook URL at this point; it does not
      exist until you do this).
- [ ] **Copy the generated webhook URL** — you'll paste it into the app's env vars in step 5.
- [ ] Re-point the two `http:ActionSendData` "send" modules (Email and WhatsApp, under both the
      Applicant and Management routes) at your actual provider's send-message endpoint and
      connection, using the field mapping in `automation/scenario-1-immediate-notify.md`.
- [ ] The Management-branch sub-routes were left empty in the blueprint file (to keep the file
      readable) — copy/paste the Applicant branch's Email and WhatsApp sub-routes into the
      Management branch and change `1.applicant.*` references to `1.management.*`. See the note in
      that blueprint's `route 41` metadata.
- [ ] Build **Scenario 2** and **Scenario 3** from scratch in the Make.com UI following
      `automation/scenario-2-batch-notify.md` and `automation/scenario-3-retry-failed.md` — no
      blueprint file was produced for these two (they're simpler: schedule → HTTP → iterator, no
      router fan-out). Ask for a blueprint JSON for either if a starting-point file would help.

## 4. Generate and place the shared webhook secret (Setup Checklist tab item 14)

- [ ] **Generate a long random value yourself** (e.g. `openssl rand -hex 32`, or any password
      manager's "generate password" feature, 32+ characters). **Do not send this value to an AI
      assistant or paste it into chat** — generate and copy it directly between the two places it
      needs to live.
- [ ] Paste it into **Vercel > Project Settings > Environment Variables** as `MAKE_WEBHOOK_SECRET`
      (and into your local `.env.local` for local testing — this agent did not touch that file; you
      add it yourself).
- [ ] Paste the **same value** into the Scenario 1 (and 3) webhook-secret filter/writeback header in
      Make.com (wherever the blueprint's filter/HTTP modules reference the secret — see the note in
      that blueprint file about not hardcoding it in a way that ends up in a shared export).
- [ ] Also set `MAKE_WEBHOOK_URL` in Vercel/`.env.local` to the webhook URL you copied in step 3.

## 5. Generate and place the Edge Function secret

- [ ] Generate a **second, different** long random value for `DUE_HEARINGS_SECRET` (see
      `supabase/functions/due-hearings/index.ts`'s header comment for why this is a separate secret
      from `MAKE_WEBHOOK_SECRET`).
- [ ] Once your Supabase project is linked locally (`npx supabase link`), set it as an Edge
      Function secret — this is **not** the same as an app env var:
      ```
      npx supabase secrets set DUE_HEARINGS_SECRET=<your-generated-value>
      ```
- [ ] Deploy the function: `npx supabase functions deploy due-hearings`.
- [ ] Paste the same `DUE_HEARINGS_SECRET` value into Scenario 2's `HTTP module → due-hearings`
      call's `x-webhook-secret` header in Make.com.

## 6. Point the local/dev URL during testing, prod URL once deployed

- [ ] While testing locally, Make.com needs to reach your app over the public internet, not
      `localhost` — use a tunnel (`ngrok http 3000`, or similar) and put that tunnel's HTTPS URL
      wherever this checklist says "the webhook URL to paste in" (i.e., `MAKE_WEBHOOK_URL` points
      *into* Make.com, but Make.com's own writeback calls to `/api/deliveries/callback` need to
      reach *your* app, which is the piece that needs the tunnel URL during local dev).
- [ ] Once deployed to Vercel, switch that same reference to your production domain (Setup
      Checklist tab item 15 covers choosing the domain itself).

## 7. Final smoke test (do this before relying on any scenario for a real case)

- [ ] Generate one real notice for a test case with your own email/WhatsApp number as the
      party's contact details.
- [ ] Confirm: email arrives, WhatsApp template message arrives, `notice_deliveries` rows show
      `status = 'sent'` with a `provider_message_id`, and `notices.status` rolls up to `sent`.
- [ ] Deliberately break something (e.g. temporarily wrong API key) and confirm a `failed` status
      with a populated `error` column shows up, then fix it and confirm Scenario 3 successfully
      retries it the next day (or trigger a manual test run of Scenario 3 in Make.com rather than
      waiting for the 2 PM schedule).

## Open items this checklist cannot resolve for you

- **Telugu templates** — blocked on the bilingual-notices decision (Overview tab) and a Telugu
  speaker's review (see step 1 above).
- **`template_id` resolution for Scenario 2** — flagged in `automation/scenario-2-batch-notify.md`
  as needing a decision from notice-api-engineer; not a Make.com click-through, a code change.
- **Manual "Retry" button in the app UI** — flagged in `automation/scenario-3-retry-failed.md` as a
  cross-agent decision (touches `src/app`), not covered by this checklist.
