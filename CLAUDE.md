@AGENTS.md

# Labour Case Management Web App

Internal web app for a Telangana Labour Department office: manage case files (EC / ID / S&E / …),
track hearings, generate notices (DOCX), and notify applicant + management by Email and WhatsApp.
Email is sent directly by the app (Resend) — no Make.com involved for that channel at all.
WhatsApp still goes through Make.com, because Meta requires a Business API provider either way.

## Source of truth
- `Labour_Portal_Full_Development_Plan.xlsx` (v2) — Roadmap, Screens, Data Model, RBAC Matrix,
  Automation, Setup Checklist, Change Log. Read it with Python/openpyxl, e.g.
  `python -c "import openpyxl; ws=openpyxl.load_workbook('Labour_Portal_Full_Development_Plan.xlsx')['Data Model']; [print(r) for r in ws.iter_rows(values_only=True)]"`
- `Labour_Portal_Full_Development_Plan_v1_backup.xlsx` is the old version — do not build from it.
- Open decisions (Overview tab): staff MIS visibility, Telugu notices, PDF vs DOCX, single vs
  multi-office file numbers, task owners. Do not silently decide these — stop and ask.

## Stack & conventions
- Next.js (App Router, TypeScript, `src/` dir), Tailwind CSS + shadcn/ui, hosted on Vercel.
- Supabase: Postgres, Auth, private Storage bucket. Client via `@supabase/ssr`.
  Schema changes only as SQL files in `supabase/migrations/` (Supabase CLI: `npx supabase`).
  Generated types in `src/types/database.ts`.
- Validation with Zod; forms with react-hook-form.
- Roles: exactly `admin` and `staff`. Staff see only cases where `assigned_officer_id = auth.uid()`.
  Access is enforced by RLS in the database, never only in the UI.
- Soft delete (`deleted_at`) — never hard-delete cases.
- Dates stored as `date`/`timestamptz`; display and schedule in Asia/Kolkata (IST).
- Secrets only in `.env.local` / Vercel env vars. `SUPABASE_SERVICE_ROLE_KEY` is server-only and
  never imported into client components. Never commit `.env*` files.
- Local database: no Docker. Schema + RLS are developed on local PostgreSQL 17 (`labour_dev`,
  URL in `.env.local` as `LOCAL_DATABASE_URL`) with a Supabase stand-in in `supabase/local-shim/`.
  `npm run db:local:reset` · `npm run db:local:test` · `npm run db:local:types`.
  Login and Storage need a real Supabase project (dev), not set up yet.
- Tests: plain-SQL RLS tests in `supabase/tests/local/` (pgTAP not installed), Vitest (unit),
  Playwright (e2e).

## Project agents (`.claude/agents/`)
| Agent | Owns |
|---|---|
| `db-architect` | `supabase/` — schema, migrations, RLS, triggers, seed, data import |
| `frontend-builder` | `src/app/**` pages & `src/components/**` — screens from the Screens tab |
| `notice-api-engineer` | `src/app/api/**`, `src/lib/notices/**` — DOCX engine, storage, direct email send (Resend), WhatsApp webhook, idempotency |
| `automation-engineer` | `automation/**`, `supabase/functions/**` — Make.com scenarios, WhatsApp only (not email), batch & retry |
| `qa-security-reviewer` | `tests/**`, `supabase/tests/**` — tests, RLS verification, security reviews |

Build order follows the Roadmap tab (Week 0 → Week 10). Update the Roadmap Status column only when
the user asks.
