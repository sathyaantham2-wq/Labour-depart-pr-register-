# Labour Case Register

Internal web app for Labour Department case files, hearings, notices and party notifications.
The build plan is in `Labour_Portal_Full_Development_Plan.xlsx` (v2); project rules are in `CLAUDE.md`.

## Stack
Next.js 16 (App Router, TypeScript) · Tailwind + shadcn/ui · Supabase (Postgres, Auth, Storage) · Make.com · Vercel

## Run locally
1. `npm install`
2. Copy `.env.local.example` to `.env.local` and fill in the Supabase URL and publishable key.
3. `npm run dev` and open http://localhost:3000 — you are sent to `/login`.

Public sign-up is off. Accounts are created by an admin (Supabase dashboard for now; the Staff
Management screen comes in Week 9).

## Database (local PostgreSQL, no Docker)
Schema and access rules are developed on a local PostgreSQL 17 database named `labour_dev`.
Set `LOCAL_DATABASE_URL` in `.env.local`, then:

| Command | Does |
|---|---|
| `npm run db:local:reset` | Drop + recreate `labour_dev`, apply the Supabase stand-in, migrations, seed |
| `npm run db:local:test` | Run the RLS and trigger tests (all changes rolled back) |
| `npm run db:local:types` | Regenerate `src/types/database.ts` |

`supabase/local-shim/` imitates the parts of Supabase the migrations need (`auth.users`,
`auth.uid()`, `anon` / `authenticated` / `service_role` roles). It is for local testing only and is
never applied to a Supabase project. The script only touches databases whose name ends in `_dev` or `_test`.

## Layout
- `src/app/login` — sign in (email + password, or magic link)
- `src/app/auth/confirm` — magic-link landing · `src/app/auth/signout` — sign out
- `src/app/(app)` — signed-in area (sidebar shell, dashboard)
- `src/lib/supabase` — browser/server clients and session refresh used by `src/proxy.ts`
- `supabase/` — Supabase CLI config; migrations go in `supabase/migrations/`
