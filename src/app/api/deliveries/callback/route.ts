import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { TablesUpdate } from "@/types/database";

export const runtime = "nodejs";

const DELIVERY_STATUSES = ["pending", "sent", "delivered", "read", "failed"] as const;
const CHANNELS = ["email", "whatsapp"] as const;

const callbackSchema = z
  .object({
    delivery_id: z.string().uuid().optional(),
    notice_id: z.string().uuid().optional(),
    party_id: z.string().uuid().optional(),
    channel: z.enum(CHANNELS).optional(),
    status: z.enum(DELIVERY_STATUSES),
    provider_message_id: z.string().trim().min(1).optional(),
    error: z.string().trim().min(1).optional(),
  })
  .refine((body) => Boolean(body.delivery_id) || Boolean(body.notice_id && body.party_id && body.channel), {
    message: "Provide either delivery_id, or all three of notice_id, party_id and channel.",
  });

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status });
}

// Constant-time string compare so a wrong secret can't be brute-forced faster
// via response-time differences than by just guessing.
function secretsMatch(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}

// Called by Make.com after it attempts to send a notice (Automation tab,
// scenarios 1-3: "After each send: HTTP PATCH notice_deliveries row"). Not a
// signed-in user, so authorization is the shared secret header, and all DB
// access uses the service-role client (notice_deliveries grants authenticated
// users read-only — see supabase/migrations/20260927100600_notices_rls.sql).
export async function POST(request: NextRequest) {
  const expectedSecret = process.env.MAKE_WEBHOOK_SECRET;
  if (!expectedSecret) {
    // Fail closed: with no secret configured there is no way to distinguish
    // a legitimate call from anyone else on the internet, so reject
    // everything rather than silently accepting unauthenticated writes.
    return jsonError(503, "Delivery callbacks are not configured: MAKE_WEBHOOK_SECRET is not set.");
  }

  const providedSecret = request.headers.get("x-webhook-secret");
  if (!providedSecret || !secretsMatch(providedSecret, expectedSecret)) {
    return jsonError(401, "Missing or invalid x-webhook-secret header.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Request body must be valid JSON.");
  }

  const parsed = callbackSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid request body.", {
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }
  const input = parsed.data;

  const admin = getSupabaseAdmin();
  if (!admin) {
    return jsonError(503, "Delivery callbacks are not configured: SUPABASE_SERVICE_ROLE_KEY is not set.");
  }

  const lookup = admin.from("notice_deliveries").select("*");
  const { data: existing, error: lookupError } = await (input.delivery_id
    ? lookup.eq("id", input.delivery_id)
    : lookup.eq("notice_id", input.notice_id!).eq("party_id", input.party_id!).eq("channel", input.channel!)
  ).maybeSingle();

  if (lookupError) {
    console.error("deliveries/callback: lookup failed", lookupError);
    return jsonError(500, "Could not look up the delivery record.");
  }
  if (!existing) {
    return jsonError(404, "No matching notice_deliveries row found.");
  }

  const update: TablesUpdate<"notice_deliveries"> = {
    status: input.status,
  };
  if (input.provider_message_id !== undefined) update.provider_message_id = input.provider_message_id;
  if (input.error !== undefined) update.error = input.error;
  if (input.status === "sent" || input.status === "delivered") {
    update.sent_at = new Date().toISOString();
  }
  if (input.status === "failed") {
    update.attempt_count = existing.attempt_count + 1;
  }

  const { data: updated, error: updateError } = await admin
    .from("notice_deliveries")
    .update(update)
    .eq("id", existing.id)
    .select("*")
    .single();
  if (updateError || !updated) {
    console.error("deliveries/callback: update failed", updateError);
    return jsonError(500, "Could not update the delivery record.");
  }

  return NextResponse.json({ delivery: updated }, { status: 200 });
}
