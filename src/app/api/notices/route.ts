import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { buildIdempotencyKey, findNoticeByIdempotencyKey } from "@/lib/notices/idempotency";
import {
  buildNoticeTemplateData,
  renderNoticeTemplate,
  TemplateRenderError,
} from "@/lib/notices/render";
import type { Tables, TablesInsert } from "@/types/database";

export const runtime = "nodejs";

const NOTICE_TYPES = ["hearing", "show_cause", "closure", "order"] as const;
type Channel = "email" | "whatsapp";
const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days, per Automation tab
const NOTICES_BUCKET = "notices";

const createNoticeSchema = z.object({
  case_id: z.string().uuid("case_id must be a valid UUID."),
  notice_type: z.enum(NOTICE_TYPES),
  hearing_id: z.string().uuid("hearing_id must be a valid UUID.").nullable().optional(),
  // Optional: the batch/automation caller (Scenario 2) only has case_id + hearing_id, not a
  // template_id, so when omitted we resolve the active template for notice_type ourselves
  // (see resolveTemplate below). The interactive Notice Generator screen can still pass an
  // explicit template_id (e.g. to let a user pick a language once more than one exists).
  template_id: z.string().uuid("template_id must be a valid UUID.").optional(),
  // Optional override for the idempotency scheme documented in
  // src/lib/notices/idempotency.ts — most callers should omit this and let
  // it be derived from hearing_id/case_id/notice_type.
  idempotency_key: z.string().trim().min(1).max(200).optional(),
});

function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Request body must be valid JSON.");
  }

  const parsed = createNoticeSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid request body.", {
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }
  const input = parsed.data;

  // Step 1: verify the caller's session and case access with the per-request,
  // RLS-scoped client. This is the only authorization check in this route —
  // everything after this point uses the service-role client, which bypasses
  // RLS entirely, so this check is load-bearing.
  const userClient = await createClient();
  const { data: claimsData } = await userClient.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) {
    return jsonError(401, "You must be signed in to generate a notice.");
  }

  const { data: caseRow, error: caseError } = await userClient
    .from("cases")
    .select("*")
    .eq("id", input.case_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (caseError) {
    console.error("notices route: failed to load case", caseError);
    return jsonError(500, "Could not load the case.");
  }
  if (!caseRow) {
    // Deliberately the same response whether the case doesn't exist or RLS
    // denied access — don't reveal which via the status/message.
    return jsonError(404, "Case not found, or you do not have access to it.");
  }

  let template: Tables<"notice_templates">;
  if (input.template_id) {
    const { data: explicitTemplate, error: templateError } = await userClient
      .from("notice_templates")
      .select("*")
      .eq("id", input.template_id)
      .maybeSingle();
    if (templateError) {
      console.error("notices route: failed to load template", templateError);
      return jsonError(500, "Could not load the notice template.");
    }
    if (!explicitTemplate) {
      return jsonError(404, "Notice template not found, or it is inactive.");
    }
    template = explicitTemplate;
  } else {
    // No template_id given (the batch/automation path): resolve the one active template for
    // this notice_type. Ambiguous on purpose when more than one matches — e.g. once a Telugu
    // template is added alongside the English one — rather than silently guessing a language
    // for a legal notice.
    const { data: candidates, error: candidatesError } = await userClient
      .from("notice_templates")
      .select("*")
      .eq("notice_type", input.notice_type)
      .eq("active", true);
    if (candidatesError) {
      console.error("notices route: failed to look up templates", candidatesError);
      return jsonError(500, "Could not look up the notice template.");
    }
    if (!candidates || candidates.length === 0) {
      return jsonError(
        422,
        `No active template found for notice_type "${input.notice_type}". Add one in Notice Templates first.`,
      );
    }
    if (candidates.length > 1) {
      return jsonError(
        422,
        `More than one active template matches notice_type "${input.notice_type}" — pass template_id explicitly to choose one.`,
        { candidates: candidates.map((t) => ({ id: t.id, name: t.name, language: t.language })) },
      );
    }
    template = candidates[0];
  }
  if (template.notice_type !== input.notice_type) {
    return jsonError(
      422,
      `Template "${template.name}" is for notice_type "${template.notice_type}", not "${input.notice_type}".`,
    );
  }

  const { data: parties, error: partiesError } = await userClient
    .from("parties")
    .select("*")
    .eq("case_id", input.case_id);
  if (partiesError) {
    console.error("notices route: failed to load parties", partiesError);
    return jsonError(500, "Could not load the case's parties.");
  }

  let hearing: { hearing_date: string; hearing_time: string | null } | null = null;
  if (input.hearing_id) {
    const { data: hearingRow, error: hearingError } = await userClient
      .from("hearings")
      .select("*")
      .eq("id", input.hearing_id)
      .maybeSingle();
    if (hearingError) {
      console.error("notices route: failed to load hearing", hearingError);
      return jsonError(500, "Could not load the hearing.");
    }
    if (!hearingRow || hearingRow.case_id !== input.case_id) {
      return jsonError(422, "hearing_id does not refer to a hearing on this case.");
    }
    hearing = { hearing_date: hearingRow.hearing_date, hearing_time: hearingRow.hearing_time };
  }

  // Step 2 onwards: switch to the service-role client. notices/notice_deliveries
  // RLS grants authenticated users select/insert on notices and read-only on
  // notice_deliveries — never update/delete — and there are zero
  // storage.objects policies on the private `notices` bucket, so only
  // service_role can read/write it. Case access was already confirmed above.
  const admin = getSupabaseAdmin();
  if (!admin) {
    return jsonError(
      503,
      "Notice generation is not configured: SUPABASE_SERVICE_ROLE_KEY is not set.",
    );
  }

  const idempotencyKey = buildIdempotencyKey({
    caseId: input.case_id,
    hearingId: input.hearing_id ?? null,
    noticeType: input.notice_type,
    clientKey: input.idempotency_key,
  });

  let existing;
  try {
    existing = await findNoticeByIdempotencyKey(admin, idempotencyKey);
  } catch (err) {
    console.error("notices route: idempotency lookup failed", err);
    return jsonError(500, "Could not check for an existing notice.");
  }

  if (existing) {
    const { data: existingDeliveries, error: existingDeliveriesError } = await admin
      .from("notice_deliveries")
      .select("*")
      .eq("notice_id", existing.id);
    if (existingDeliveriesError) {
      console.error("notices route: failed to load existing deliveries", existingDeliveriesError);
    }
    return NextResponse.json(
      {
        notice: existing,
        deliveries: existingDeliveries ?? [],
        idempotent: true,
        webhook: "skipped: a notice with this idempotency key already exists",
      },
      { status: 200 },
    );
  }

  // Work out which (party, channel) combinations actually have somewhere to
  // send to. Channels with no recipient on file are skipped, not errored —
  // unless that leaves the notice with nowhere to go at all.
  const plannedDeliveries: { party: Tables<"parties">; channel: Channel; recipient: string }[] = [];
  const skippedDeliveries: { party_id: string; role: string; channel: string; reason: string }[] = [];

  for (const party of parties ?? []) {
    const email = party.email?.trim();
    if (email) {
      plannedDeliveries.push({ party, channel: "email", recipient: email });
    } else {
      skippedDeliveries.push({
        party_id: party.id,
        role: party.role,
        channel: "email",
        reason: "party has no email on file",
      });
    }

    const whatsapp = party.whatsapp_phone?.trim();
    if (whatsapp) {
      plannedDeliveries.push({ party, channel: "whatsapp", recipient: whatsapp });
    } else {
      skippedDeliveries.push({
        party_id: party.id,
        role: party.role,
        channel: "whatsapp",
        reason: "party has no whatsapp_phone on file",
      });
    }
  }

  if (plannedDeliveries.length === 0) {
    return jsonError(
      422,
      "Cannot generate this notice: neither party has an email or WhatsApp number on file, so it could never be delivered.",
      { skippedDeliveries },
    );
  }

  // Step 3: load + render the template.
  const { data: templateFile, error: downloadError } = await admin.storage
    .from(NOTICES_BUCKET)
    .download(template.docx_path);
  if (downloadError || !templateFile) {
    console.error("notices route: failed to download template", downloadError);
    return jsonError(500, "Could not load the notice template file from storage.");
  }
  const templateBuffer = Buffer.from(await templateFile.arrayBuffer());

  const templateData = buildNoticeTemplateData({
    caseFields: {
      file_number: caseRow.file_number,
      subject: caseRow.subject,
      act: caseRow.act,
      memo_number: caseRow.memo_number,
      received_date: caseRow.received_date,
      next_hearing_date: caseRow.next_hearing_date,
      office_code: caseRow.office_code,
    },
    parties: (parties ?? []).map((p) => ({
      role: p.role,
      name: p.name,
      address: p.address,
      email: p.email,
      phone: p.phone,
      whatsapp_phone: p.whatsapp_phone,
    })),
    hearing,
  });

  let renderedBuffer: Buffer;
  try {
    renderedBuffer = renderNoticeTemplate(templateBuffer, templateData);
  } catch (err) {
    if (err instanceof TemplateRenderError) {
      return jsonError(422, err.message, { missingPlaceholders: err.missingPlaceholders });
    }
    console.error("notices route: unexpected template rendering error", err);
    return jsonError(500, "Could not render the notice template.");
  }

  // Step 4: upload to the private `notices` bucket.
  const noticeId = randomUUID();
  const docPath = `cases/${input.case_id}/${noticeId}.docx`;
  const { error: uploadError } = await admin.storage.from(NOTICES_BUCKET).upload(docPath, renderedBuffer, {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    upsert: false,
  });
  if (uploadError) {
    console.error("notices route: failed to upload notice document", uploadError);
    return jsonError(500, "Could not save the generated notice document.");
  }

  // Step 5: insert notices row + one notice_deliveries row per (party, channel).
  const noticeInsert: TablesInsert<"notices"> = {
    id: noticeId,
    case_id: input.case_id,
    hearing_id: input.hearing_id ?? null,
    template_id: template.id,
    type: input.notice_type,
    doc_path: docPath,
    generated_by: userId,
    idempotency_key: idempotencyKey,
  };

  const { data: notice, error: noticeInsertError } = await admin
    .from("notices")
    .insert(noticeInsert)
    .select("*")
    .single();
  if (noticeInsertError || !notice) {
    console.error("notices route: failed to insert notice row", noticeInsertError);
    // Best-effort cleanup so we don't leave an orphaned file with no DB row.
    await admin.storage.from(NOTICES_BUCKET).remove([docPath]);
    return jsonError(500, "Could not create the notice record.");
  }

  const deliveryInserts: TablesInsert<"notice_deliveries">[] = plannedDeliveries.map((d) => ({
    notice_id: notice.id,
    party_id: d.party.id,
    channel: d.channel,
    recipient: d.recipient,
  }));

  const { data: deliveries, error: deliveriesInsertError } = await admin
    .from("notice_deliveries")
    .insert(deliveryInserts)
    .select("*");
  if (deliveriesInsertError) {
    console.error("notices route: failed to insert notice_deliveries rows", deliveriesInsertError);
    return jsonError(500, "The notice was created, but its delivery records could not be saved.", {
      notice,
    });
  }

  // Step 6: signed URL + Make.com webhook. Automation isn't configured yet in
  // most environments — that's not an error, the notice + deliveries above
  // are already durably created with status 'pending'; we just say plainly
  // that no send was attempted.
  let webhookStatus: string;
  const webhookUrl = process.env.MAKE_WEBHOOK_URL;
  const webhookSecret = process.env.MAKE_WEBHOOK_SECRET;

  if (!webhookUrl) {
    webhookStatus = "skipped: MAKE_WEBHOOK_URL not configured";
  } else if (!webhookSecret) {
    webhookStatus = "skipped: MAKE_WEBHOOK_SECRET not configured";
  } else {
    const { data: signedUrlData, error: signedUrlError } = await admin.storage
      .from(NOTICES_BUCKET)
      .createSignedUrl(docPath, SIGNED_URL_TTL_SECONDS);
    if (signedUrlError || !signedUrlData) {
      console.error("notices route: failed to create signed URL", signedUrlError);
      webhookStatus = "skipped: could not create a signed URL for the document";
    } else {
      const applicant = (parties ?? []).find((p) => p.role === "applicant") ?? null;
      const management = (parties ?? []).find((p) => p.role === "management") ?? null;

      // Lets Make.com's writeback to /api/deliveries/callback pass delivery_id directly
      // instead of reconstructing (notice_id, party_id, channel) itself.
      function deliveryIdsFor(partyId: string): { email: { delivery_id: string } | null; whatsapp: { delivery_id: string } | null } {
        const forParty = (deliveries ?? []).filter((d) => d.party_id === partyId);
        return {
          email: forParty.find((d) => d.channel === "email")
            ? { delivery_id: forParty.find((d) => d.channel === "email")!.id }
            : null,
          whatsapp: forParty.find((d) => d.channel === "whatsapp")
            ? { delivery_id: forParty.find((d) => d.channel === "whatsapp")!.id }
            : null,
        };
      }

      // Extra context so Make.com can fill in email subjects and WhatsApp template
      // variables ({{1}}, {{2}}, ...) without a second authenticated call back into
      // this app. Not in the Automation tab's original documented shape — added at
      // the automation-engineer agent's request (it designed the Make.com scenarios
      // against exactly this extended shape).
      let sectionName: string | null = null;
      if (caseRow.section_id) {
        const { data: sectionRow } = await admin
          .from("sections")
          .select("name")
          .eq("id", caseRow.section_id)
          .maybeSingle();
        sectionName = sectionRow?.name ?? null;
      }

      const payload = {
        notice_id: notice.id,
        case_id: input.case_id,
        hearing_id: input.hearing_id ?? null,
        notice_type: input.notice_type,
        doc_url: signedUrlData.signedUrl,
        case: {
          file_number: caseRow.file_number,
          office_code: caseRow.office_code,
          act: caseRow.act,
          section_name: sectionName,
        },
        hearing: hearing ? { hearing_date: hearing.hearing_date, hearing_time: hearing.hearing_time } : null,
        applicant: applicant
          ? {
              id: applicant.id,
              name: applicant.name,
              email: applicant.email,
              whatsapp_phone: applicant.whatsapp_phone,
              preferred_language: applicant.preferred_language,
              deliveries: deliveryIdsFor(applicant.id),
            }
          : null,
        management: management
          ? {
              id: management.id,
              name: management.name,
              email: management.email,
              whatsapp_phone: management.whatsapp_phone,
              preferred_language: management.preferred_language,
              deliveries: deliveryIdsFor(management.id),
            }
          : null,
        whatsapp_template_name: template.whatsapp_template_name,
      };

      try {
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-webhook-secret": webhookSecret },
          body: JSON.stringify(payload),
        });
        webhookStatus = res.ok ? "sent" : `failed: Make.com webhook responded with HTTP ${res.status}`;
        if (!res.ok) console.error("notices route: Make.com webhook returned non-OK status", res.status);
      } catch (err) {
        console.error("notices route: Make.com webhook request failed", err);
        webhookStatus = `failed: ${err instanceof Error ? err.message : "webhook request could not be sent"}`;
      }
    }
  }

  return NextResponse.json(
    {
      notice,
      deliveries: deliveries ?? [],
      skippedDeliveries,
      idempotent: false,
      webhook: webhookStatus,
    },
    { status: 201 },
  );
}
