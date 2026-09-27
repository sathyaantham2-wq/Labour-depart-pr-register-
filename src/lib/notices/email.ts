import "server-only";
import { Resend } from "resend";

// Sends a generated notice by email directly from the app — no Make.com, no external
// automation tool. WhatsApp still needs a Business API provider (Meta requires one; there is
// no way around that), so it continues to go through the webhook path in src/app/api/notices/
// route.ts. Email does not, so it doesn't have to wait on WhatsApp's approval process.
//
// Returns null instead of throwing when RESEND_API_KEY isn't configured yet, matching the same
// convention as src/lib/server/supabase-admin.ts, so callers can show a clear "not configured"
// result per delivery rather than crashing the whole notice-generation request.
function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export type SendNoticeEmailInput = {
  to: string;
  recipientName: string;
  caseFileNumber: string;
  noticeTypeLabel: string; // e.g. "Hearing Notice", "Show Cause Notice"
  attachment: { filename: string; content: Buffer };
};

export type SendNoticeEmailResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string };

const NOTICE_TYPE_BODY: Record<string, string> = {
  "Hearing Notice":
    "This notice relates to an upcoming hearing for the case referenced below. Please review the attached document for the date, time and venue.",
  "Show Cause Notice":
    "This notice requires you to respond regarding the case referenced below. Please review the attached document for details and the response deadline.",
  "Closure Notice":
    "This notice informs you that the case referenced below has been closed. Please review the attached document for details.",
  Order: "Please find attached an order relating to the case referenced below.",
};

// Not configured as a fixed sender name/address here on purpose — office identity (from
// address, display name) belongs in env vars, not hardcoded into application code, and must
// match a domain verified in the Resend dashboard for good deliverability.
export async function sendNoticeEmail(input: SendNoticeEmailInput): Promise<SendNoticeEmailResult> {
  const resend = getResendClient();
  if (!resend) {
    return { ok: false, error: "Email is not configured: RESEND_API_KEY is not set." };
  }

  const fromAddress = process.env.NOTICES_FROM_EMAIL;
  if (!fromAddress) {
    return { ok: false, error: "Email is not configured: NOTICES_FROM_EMAIL is not set." };
  }

  const intro =
    NOTICE_TYPE_BODY[input.noticeTypeLabel] ??
    "Please find attached a notice relating to the case referenced below.";

  const { data, error } = await resend.emails.send({
    from: fromAddress,
    to: input.to,
    subject: `${input.noticeTypeLabel} — Case ${input.caseFileNumber}`,
    text: [
      `Dear ${input.recipientName},`,
      "",
      intro,
      "",
      `Case file number: ${input.caseFileNumber}`,
      "",
      "This is an automated message from the Labour Department case register. The notice document is attached.",
    ].join("\n"),
    attachments: [{ filename: input.attachment.filename, content: input.attachment.content }],
  });

  if (error) {
    return { ok: false, error: error.message || "Resend rejected the email." };
  }
  if (!data?.id) {
    return { ok: false, error: "Resend accepted the request but returned no message id." };
  }
  return { ok: true, providerMessageId: data.id };
}

// Human-readable label for a notice's `type` column, used in the email subject/body.
export function noticeTypeLabel(type: string): string {
  switch (type) {
    case "hearing":
      return "Hearing Notice";
    case "show_cause":
      return "Show Cause Notice";
    case "closure":
      return "Closure Notice";
    case "order":
      return "Order";
    default:
      return "Notice";
  }
}
