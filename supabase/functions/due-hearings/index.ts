// supabase/functions/due-hearings/index.ts
//
// Deno Edge Function backing Scenario 2 (Batch/Scheduled Notify) — see
// automation/scenario-2-batch-notify.md for the calling scenario's full design.
//
// Returns hearings that are "due" for a hearing notice:
//   - hearings.status = 'scheduled'
//   - hearings.hearing_date is between today (IST) and today + N days (IST), inclusive
//   - there is NO notices row for that hearing_id with type = 'hearing' AND
//     status IN ('sent', 'partial') — i.e. a hearing with no notice at all, or whose only
//     notice attempt is 'pending' or 'failed', is still due. This is what makes the daily
//     Scenario 2 run safe to re-execute without spamming parties who were already notified.
//
// ---------------------------------------------------------------------------------------
// Why N = 3 days by default
// ---------------------------------------------------------------------------------------
// The Roadmap tab's cadence note ("e.g. 9:00 AM IST daily") only fixes *when* the batch runs,
// not how far ahead it should look. 3 days was chosen because:
//   - It gives the applicant/management side enough lead time to prepare for a hearing without
//     the notice going out so early that a subsequent adjournment (hearings.status can change to
//     'adjourned'/'cancelled' after the notice already went out) makes the notice stale-but-sent.
//   - Because this function runs from a *daily* schedule, a hearing 3 days out today will also be
//     picked up on the next 2 days' runs *if* its notice attempt failed both times — giving the
//     retry/re-notify path (Scenario 3, and simply re-running this batch) two more free chances to
//     succeed before the hearing date arrives, without any extra logic here: the "no sent/partial
//     notice yet" condition is exactly what re-surfaces it.
//   - It matches a typical government-notice lead time (a few working days) better than either a
//     same-day or a multi-week window would.
// Tune via the `days` query param if 3 turns out to be wrong in practice; there's no other place
// this default is encoded.
//
// ---------------------------------------------------------------------------------------
// Auth: DUE_HEARINGS_SECRET, not MAKE_WEBHOOK_SECRET
// ---------------------------------------------------------------------------------------
// This function reuses the `x-webhook-secret` HEADER NAME for consistency with the app's other
// webhook/callback endpoints, but expects a *different* secret VALUE, configured as its own Edge
// Function secret `DUE_HEARINGS_SECRET` (via `supabase secrets set DUE_HEARINGS_SECRET=...` once
// the project is linked — this is separate from the Next.js app's `.env.local` / Vercel env, which
// this function cannot read).
//
// Why not just reuse MAKE_WEBHOOK_SECRET everywhere? Three distinct trust boundaries currently
// exist:
//   1. This app -> Make.com (outbound webhook call, proves the call came from the app)
//   2. Make.com -> this app's /api/deliveries/callback (proves the call came from Make.com)
//   3. Make.com -> this Edge Function (proves the call came from Make.com)
// (2) and (3) could share a secret since both have the same caller (Make.com) and the same goal
// (accept Make.com's HTTP calls). But this function is deployed and rotated independently of the
// Next.js app (different deploy pipeline, different secret store — `supabase secrets set` vs
// Vercel env vars), so giving it its own secret means rotating one never requires touching the
// other, and a leak of one (e.g. this function's secret showing up in a Make.com HTTP module's
// visible request log, which the user can see in plaintext in their scenario history) doesn't
// also compromise delivery-status writeback. Smaller blast radius, independent rotation — worth
// one extra secret to manage. If that tradeoff feels like overkill for a 2-person office, it is a
// safe simplification to point DUE_HEARINGS_SECRET at the same value as MAKE_WEBHOOK_SECRET.

import { createClient } from "npm:@supabase/supabase-js@2";

const DEFAULT_DAYS = 3;
const MAX_DAYS = 30;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Constant-time-ish string compare so secret checks don't leak timing info via early exit.
// (Not a cryptographic guarantee on V8/Deno, but strictly better than `===` short-circuiting.)
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// Today's date and today+N in Asia/Kolkata, as YYYY-MM-DD strings (matches the `date` column
// type of hearings.hearing_date — comparing as text/date, not timestamptz, avoids any UTC/IST
// off-by-one at midnight).
function istDateRange(days: number): { from: string; to: string } {
  const now = new Date();
  // en-CA locale formats as YYYY-MM-DD, which is what we want for a `date` column comparison.
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayStr = formatter.format(now); // YYYY-MM-DD in IST, today
  const [y, m, d] = todayStr.split("-").map((n) => parseInt(n, 10));
  // Build the "to" date by adding `days` to the IST calendar date (via UTC noon anchor to dodge
  // DST-less-but-still-be-careful date math; Asia/Kolkata has no DST so this is safe either way).
  const toDate = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  const toStr = formatter.format(toDate);
  return { from: todayStr, to: toStr };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const expectedSecret = Deno.env.get("DUE_HEARINGS_SECRET");
  if (!expectedSecret) {
    // Fail closed: an unconfigured secret must never mean "no auth required".
    return jsonResponse({ error: "server_misconfigured: DUE_HEARINGS_SECRET not set" }, 500);
  }
  const providedSecret = req.headers.get("x-webhook-secret") ?? "";
  if (!safeEqual(providedSecret, expectedSecret)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const url = new URL(req.url);
  const daysParam = url.searchParams.get("days");
  let days = DEFAULT_DAYS;
  if (daysParam !== null) {
    const parsed = Number(daysParam);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_DAYS) {
      return jsonResponse(
        { error: `invalid days param: must be an integer between 1 and ${MAX_DAYS}` },
        400,
      );
    }
    days = parsed;
  }

  // Edge Functions get SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as default secrets
  // automatically (see https://supabase.com/docs/guides/functions/secrets) — no manual
  // `supabase secrets set` needed for these two specifically, only for DUE_HEARINGS_SECRET.
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "server_misconfigured: missing Supabase env" }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { from, to } = istDateRange(days);

  try {
    // Step 1: hearing_ids that already have a notice that counts as "handled" — a hearing-type
    // notice whose rolled-up status is 'sent' or 'partial'. ('partial' still counts as handled:
    // at least one party on at least one channel got it; a fully-failed notice does not.)
    const { data: handledNotices, error: handledErr } = await supabase
      .from("notices")
      .select("hearing_id")
      .eq("type", "hearing")
      .in("status", ["sent", "partial"])
      .not("hearing_id", "is", null);

    if (handledErr) throw handledErr;

    const handledHearingIds = (handledNotices ?? [])
      .map((n) => n.hearing_id)
      .filter((id): id is string => id !== null);

    // Step 2: due hearings, joined to cases for file_number/office_code (useful for the caller's
    // digest/logging without a second round trip).
    let query = supabase
      .from("hearings")
      .select("id, case_id, hearing_date, hearing_time, cases(file_number, office_code)")
      .eq("status", "scheduled")
      .gte("hearing_date", from)
      .lte("hearing_date", to)
      .order("hearing_date", { ascending: true });

    if (handledHearingIds.length > 0) {
      // PostgREST `not.in.(...)` filter — safe because ids are server-generated UUIDs from our
      // own prior query, never interpolated from request input.
      query = query.not("id", "in", `(${handledHearingIds.join(",")})`);
    }

    const { data: dueHearings, error: dueErr } = await query;
    if (dueErr) throw dueErr;

    const result = (dueHearings ?? []).map((h) => {
      // supabase-js types the joined relation as an array even for a to-one FK; hearings.case_id
      // is `not null references cases`, so this is always exactly one row.
      const caseRow = Array.isArray(h.cases) ? h.cases[0] : h.cases;
      return {
        id: h.id,
        case_id: h.case_id,
        hearing_date: h.hearing_date,
        hearing_time: h.hearing_time,
        file_number: caseRow?.file_number ?? null,
        office_code: caseRow?.office_code ?? null,
      };
    });

    return jsonResponse(result, 200);
  } catch (err) {
    console.error("due-hearings query failed:", err);
    return jsonResponse({ error: "query_failed", detail: String(err) }, 500);
  }
});
