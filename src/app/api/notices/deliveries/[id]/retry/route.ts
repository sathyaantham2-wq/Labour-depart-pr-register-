import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { sendNoticeEmail, noticeTypeLabel } from "@/lib/notices/email";
import type { TablesUpdate } from "@/types/database";

export const runtime = "nodejs";

const NOTICES_BUCKET = "notices";
// Matches the escalation copy in the Automation tab / notice-api-engineer brief: after this
// many attempts (the original send + 2 retries) a delivery must be escalated manually instead
// of retried again from this endpoint.
const MAX_ATTEMPTS = 3;

const paramsSchema = z.object({ id: z.string().uuid("Invalid delivery id.") });

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status });
}

// Retries a *failed email* notice_deliveries row by re-downloading the already-rendered DOCX
// (notices.doc_path) and re-sending it via Resend — never re-rendering the template, so a
// retry resends the exact document that was originally generated even if case data has since
// changed. WhatsApp deliveries are out of scope on purpose: they retry through Make.com's
// Scenario 3 (see automation/scenario-3-retry-failed.md), which this endpoint does not touch.
export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsedParams = paramsSchema.safeParse({ id });
  if (!parsedParams.success) {
    return jsonError(400, "Invalid delivery id.");
  }
  const deliveryId = parsedParams.data.id;

  // Step 1: verify the caller's session and case access with the per-request, RLS-scoped
  // client. notice_deliveries' only read policy is scoped through the parent notice's case
  // (see supabase/migrations/20260927100600_notices_rls.sql), so a plain select-by-id here is
  // enough to confirm case access — no separate case lookup needed. This is the only
  // authorization check in this route; everything after it uses the service-role client, which
  // bypasses RLS entirely.
  const userClient = await createClient();
  const { data: claimsData } = await userClient.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) {
    return jsonError(401, "You must be signed in to retry a delivery.");
  }

  const { data: delivery, error: deliveryError } = await userClient
    .from("notice_deliveries")
    .select("*")
    .eq("id", deliveryId)
    .maybeSingle();
  if (deliveryError) {
    console.error("retry-delivery route: failed to load delivery", deliveryError);
    return jsonError(500, "Could not load the delivery record.");
  }
  if (!delivery) {
    // Deliberately the same response whether the delivery doesn't exist or RLS denied access —
    // don't reveal which via the status/message, matching src/app/api/notices/route.ts.
    return jsonError(404, "Delivery not found, or you do not have access to it.");
  }

  if (delivery.channel !== "email") {
    return jsonError(
      400,
      "Only email deliveries can be retried here — WhatsApp retries go through Make.com's Scenario 3, not this endpoint.",
    );
  }
  if (delivery.status !== "failed") {
    return jsonError(400, "Only failed deliveries can be retried.");
  }
  if (delivery.attempt_count >= MAX_ATTEMPTS) {
    return jsonError(
      400,
      "This delivery has already been retried the maximum number of times; escalate manually.",
    );
  }

  // Step 2 onwards: switch to the service-role client. notice_deliveries grants authenticated
  // users read-only (no write policy at all), and there are zero storage.objects policies on
  // the private `notices` bucket, so only service_role can read the document or write the
  // delivery row. Case access was already confirmed above.
  const admin = getSupabaseAdmin();
  if (!admin) {
    return jsonError(503, "Notice retry is not configured: SUPABASE_SERVICE_ROLE_KEY is not set.");
  }

  const { data: notice, error: noticeError } = await admin
    .from("notices")
    .select("*")
    .eq("id", delivery.notice_id)
    .maybeSingle();
  if (noticeError || !notice) {
    console.error("retry-delivery route: failed to load notice", noticeError);
    return jsonError(500, "Could not load the notice for this delivery.");
  }

  const { data: party, error: partyError } = await admin
    .from("parties")
    .select("*")
    .eq("id", delivery.party_id)
    .maybeSingle();
  if (partyError || !party) {
    console.error("retry-delivery route: failed to load party", partyError);
    return jsonError(500, "Could not load the recipient for this delivery.");
  }

  const { data: caseRow, error: caseError } = await admin
    .from("cases")
    .select("*")
    .eq("id", notice.case_id)
    .maybeSingle();
  if (caseError || !caseRow) {
    console.error("retry-delivery route: failed to load case", caseError);
    return jsonError(500, "Could not load the case for this delivery.");
  }

  // Re-download the already-rendered document rather than re-rendering the template — see the
  // module comment above for why.
  const { data: docFile, error: downloadError } = await admin.storage
    .from(NOTICES_BUCKET)
    .download(notice.doc_path);
  if (downloadError || !docFile) {
    console.error("retry-delivery route: failed to download notice document", downloadError);
    return jsonError(500, "Could not load the generated notice document from storage.");
  }
  const docBuffer = Buffer.from(await docFile.arrayBuffer());

  const sendResult = await sendNoticeEmail({
    to: delivery.recipient,
    recipientName: party.name || "Sir/Madam",
    caseFileNumber: caseRow.file_number,
    noticeTypeLabel: noticeTypeLabel(notice.type),
    attachment: {
      filename: `Notice-${caseRow.file_number.replace(/[^\w-]+/g, "_")}.docx`,
      content: docBuffer,
    },
  });

  const update: TablesUpdate<"notice_deliveries"> = sendResult.ok
    ? {
        status: "sent",
        provider_message_id: sendResult.providerMessageId,
        sent_at: new Date().toISOString(),
        error: null,
        attempt_count: delivery.attempt_count + 1,
      }
    : {
        status: "failed",
        error: sendResult.error,
        attempt_count: delivery.attempt_count + 1,
      };

  const { data: updated, error: updateError } = await admin
    .from("notice_deliveries")
    .update(update)
    .eq("id", delivery.id)
    .select("*")
    .single();
  if (updateError || !updated) {
    console.error("retry-delivery route: failed to record retry result", updateError);
    return jsonError(500, "The retry was attempted, but the delivery record could not be updated.");
  }

  if (!sendResult.ok) {
    console.error("retry-delivery route: retry email send failed", { deliveryId: delivery.id, error: sendResult.error });
    // Still a successful API call (the retry was attempted and recorded) — the failure is
    // reflected in the returned row's status/error, not the HTTP status, mirroring how
    // src/app/api/deliveries/callback/route.ts always returns 200 once it records an outcome.
  }

  return NextResponse.json({ delivery: updated }, { status: 200 });
}
