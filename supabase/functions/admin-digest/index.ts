// supabase/functions/admin-digest/index.ts
//
// Deno Edge Function: daily digest of notice/delivery activity, emailed to active admin
// profiles. See automation/scenario-4-admin-digest.md for the full design and, in particular,
// why this is a pg_cron-triggered Edge Function calling Resend directly rather than a Make.com
// scenario (email is out of scope for Make.com entirely, per automation/README.md).
//
// Triggered by a `pg_cron` job (via the `pg_net` extension's `net.http_post`) — this function
// does not schedule itself. Recommended schedule: daily at 18:00 Asia/Kolkata = 12:30 UTC
// (`30 12 * * *` in pg_cron, which runs in UTC; India has no DST so this offset is stable
// year-round). See the scenario doc for the exact `cron.schedule(...)` statement db-architect
// should review and add as a migration.
//
// The 24h (default) window is ROLLING (`now() - interval`), not a calendar-day boundary, so —
// unlike due-hearings/index.ts — this function needs none of that function's IST calendar-date
// arithmetic. IST only matters for how the window is *displayed* in the email body, never for
// the query's correctness.
//
// ---------------------------------------------------------------------------------------
// Auth: ADMIN_DIGEST_SECRET — a THIRD secret, distinct from MAKE_WEBHOOK_SECRET and
// DUE_HEARINGS_SECRET
// ---------------------------------------------------------------------------------------
// Same reasoning as due-hearings' header comment: independent rotation, smaller blast radius,
// deployed on a different pipeline than the Next.js app. This function's only caller is
// pg_cron (via pg_net) — never Make.com, never the Next.js app directly — so it gets its own
// secret rather than reusing DUE_HEARINGS_SECRET just because both happen to be Edge Functions.
//
// Set via `npx supabase secrets set ADMIN_DIGEST_SECRET=...`. The same value must be passed in
// the pg_cron job's net.http_post headers — recommended via Supabase Vault
// (vault.create_secret / vault.decrypted_secrets), not pasted in plaintext into a migration
// file that lands in git. That wiring is a migration (db-architect's territory), not this file.

import { createClient } from "npm:@supabase/supabase-js@2";

const DEFAULT_WINDOW_HOURS = 24;
const MAX_WINDOW_HOURS = 24 * 30; // 30 days, generous ceiling against a typo'd ?hours= value

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Constant-time-ish string compare so secret checks don't leak timing info via early exit.
// Same helper as due-hearings/index.ts (not a cryptographic guarantee on V8/Deno, but strictly
// better than `===` short-circuiting).
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function istDisplay(d: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

// Tallies rows by one or two string columns into a flat Record, e.g.
// tallyBy(rows, ["channel", "status"]) -> { "email|sent": 3, "whatsapp|failed": 1 }
function tallyBy<T extends Record<string, unknown>>(rows: T[], keys: (keyof T)[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const key = keys.map((k) => String(row[k] ?? "")).join("|");
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderCountsTable(title: string, counts: Record<string, number>, columns: string[]): string {
  const rows = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([key, n]) => {
      const parts = key.split("|");
      const cells = parts.map((p) => `<td style="padding:4px 12px;border-bottom:1px solid #eee;">${escapeHtml(p)}</td>`).join("");
      return `<tr>${cells}<td style="padding:4px 12px;border-bottom:1px solid #eee;text-align:right;"><strong>${n}</strong></td></tr>`;
    })
    .join("");
  const headerCells = columns.map((c) => `<th style="text-align:left;padding:4px 12px;">${escapeHtml(c)}</th>`).join("");
  const body = rows || `<tr><td colspan="${columns.length + 1}" style="padding:4px 12px;color:#777;">None</td></tr>`;
  return `
    <h3 style="margin:20px 0 8px;">${escapeHtml(title)}</h3>
    <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
      <thead><tr>${headerCells}<th style="text-align:right;padding:4px 12px;">Count</th></tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

function renderDigestEmail(input: {
  windowStart: Date;
  windowEnd: Date;
  noticeCounts: Record<string, number>;
  deliveryCounts: Record<string, number>;
  totalNotices: number;
  totalDeliveries: number;
}): { html: string; text: string } {
  const windowLabel = `${istDisplay(input.windowStart)} – ${istDisplay(input.windowEnd)} IST`;
  const html = `
    <div style="font-family:sans-serif;color:#222;">
      <h2 style="margin-bottom:4px;">Daily Notice Digest</h2>
      <p style="color:#555;margin-top:0;">Covering ${escapeHtml(windowLabel)}</p>
      <p>${input.totalNotices} notice(s) generated, ${input.totalDeliveries} delivery attempt(s) recorded.</p>
      ${renderCountsTable("Notices by status", input.noticeCounts, ["Status"])}
      ${renderCountsTable("Deliveries by channel / status", input.deliveryCounts, ["Channel", "Status"])}
      <p style="color:#999;font-size:12px;margin-top:24px;">
        Automated message from the Labour Case Management app. This digest does not require any action
        unless the failed counts above look unexpected — check the Notice History screen for details.
      </p>
    </div>`;

  const noticeLines = Object.entries(input.noticeCounts).map(([k, n]) => `  ${k}: ${n}`).join("\n") || "  None";
  const deliveryLines = Object.entries(input.deliveryCounts).map(([k, n]) => `  ${k}: ${n}`).join("\n") || "  None";
  const text = [
    "Daily Notice Digest",
    `Covering ${windowLabel}`,
    "",
    `${input.totalNotices} notice(s) generated, ${input.totalDeliveries} delivery attempt(s) recorded.`,
    "",
    "Notices by status:",
    noticeLines,
    "",
    "Deliveries by channel/status:",
    deliveryLines,
    "",
    "Automated message from the Labour Case Management app.",
  ].join("\n");

  return { html, text };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const expectedSecret = Deno.env.get("ADMIN_DIGEST_SECRET");
  if (!expectedSecret) {
    // Fail closed: an unconfigured secret must never mean "no auth required".
    return jsonResponse({ error: "server_misconfigured: ADMIN_DIGEST_SECRET not set" }, 500);
  }
  const providedSecret = req.headers.get("x-webhook-secret") ?? "";
  if (!safeEqual(providedSecret, expectedSecret)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const url = new URL(req.url);
  const hoursParam = url.searchParams.get("hours");
  let windowHours = DEFAULT_WINDOW_HOURS;
  if (hoursParam !== null) {
    const parsed = Number(hoursParam);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_WINDOW_HOURS) {
      return jsonResponse(
        { error: `invalid hours param: must be an integer between 1 and ${MAX_WINDOW_HOURS}` },
        400,
      );
    }
    windowHours = parsed;
  }

  // Edge Functions get SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as default secrets
  // automatically (see https://supabase.com/docs/guides/functions/secrets) — same as
  // due-hearings/index.ts.
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "server_misconfigured: missing Supabase env" }, 500);
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromAddress = Deno.env.get("NOTICES_FROM_EMAIL");
  if (!resendApiKey || !fromAddress) {
    return jsonResponse(
      { error: "server_misconfigured: RESEND_API_KEY / NOTICES_FROM_EMAIL not set" },
      500,
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - windowHours * 60 * 60 * 1000);

  try {
    const [noticesRes, deliveriesRes, adminsRes] = await Promise.all([
      supabase.from("notices").select("status").gte("generated_at", windowStart.toISOString()),
      supabase
        .from("notice_deliveries")
        .select("channel, status")
        .gte("updated_at", windowStart.toISOString()),
      supabase.from("profiles").select("email, full_name").eq("role", "admin").eq("active", true),
    ]);

    if (noticesRes.error) throw noticesRes.error;
    if (deliveriesRes.error) throw deliveriesRes.error;
    if (adminsRes.error) throw adminsRes.error;

    const recipients = (adminsRes.data ?? [])
      .map((a) => a.email?.trim())
      .filter((e): e is string => !!e);

    if (recipients.length === 0) {
      console.warn("admin-digest: no active admin recipients found, skipping send");
      return jsonResponse({ sent: false, reason: "no_active_admin_recipients" }, 200);
    }

    const notices = noticesRes.data ?? [];
    const deliveries = deliveriesRes.data ?? [];
    const noticeCounts = tallyBy(notices, ["status"]);
    const deliveryCounts = tallyBy(deliveries, ["channel", "status"]);

    const { html, text } = renderDigestEmail({
      windowStart,
      windowEnd,
      noticeCounts,
      deliveryCounts,
      totalNotices: notices.length,
      totalDeliveries: deliveries.length,
    });

    const subjectDate = istDisplay(windowEnd).split(",")[0]; // just the date portion
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: fromAddress,
        to: recipients,
        subject: `Daily Notice Digest — ${subjectDate}`,
        html,
        text,
      }),
    });

    if (!emailRes.ok) {
      const body = await emailRes.text();
      console.error("admin-digest: Resend rejected the digest email", emailRes.status, body.slice(0, 500));
      return jsonResponse(
        { sent: false, error: `Resend responded with HTTP ${emailRes.status}` },
        502,
      );
    }

    return jsonResponse(
      {
        sent: true,
        recipients,
        window: { start: windowStart.toISOString(), end: windowEnd.toISOString() },
        notices: noticeCounts,
        deliveries: deliveryCounts,
      },
      200,
    );
  } catch (err) {
    console.error("admin-digest failed:", err);
    return jsonResponse({ error: "query_failed", detail: String(err) }, 500);
  }
});
