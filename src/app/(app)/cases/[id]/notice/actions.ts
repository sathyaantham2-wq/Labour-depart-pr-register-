"use server";

import { NextRequest } from "next/server";
import { z } from "zod";
import { NOTICE_TYPES } from "@/components/notice-templates/constants";
// Calling the route handler's exported POST directly rather than making a real network
// request: it's the same logic, it already re-checks case access itself via the signed-in
// user's session (createClient() inside it reads the same request-scoped cookies this Server
// Action runs under), and it avoids having to reconstruct an absolute same-origin URL plus
// forward auth cookies by hand. See src/app/api/notices/route.ts (owned by the
// notice-api-engineer agent — not modified here, only imported).
import { POST as createNoticeRoute } from "@/app/api/notices/route";
import type { Tables } from "@/types/database";

const inputSchema = z.object({
  case_id: z.string().uuid(),
  notice_type: z.enum(NOTICE_TYPES),
  hearing_id: z.string().uuid().optional(),
});

export type GenerateNoticeResponse = {
  error?: string;
  issues?: { path: string; message: string }[];
  missingPlaceholders?: string[];
  candidates?: { id: string; name: string; language: string }[];
  skippedDeliveries?: { party_id: string; role: string; channel: string; reason: string }[];
  notice?: Tables<"notices">;
  deliveries?: Tables<"notice_deliveries">[];
  emailResults?: { party_id: string; recipient: string; status: "sent" | "failed"; error?: string }[];
  idempotent?: boolean;
  webhook?: string;
};

export type GenerateNoticeResult = {
  status: number;
  data: GenerateNoticeResponse;
};

export async function generateNotice(input: {
  case_id: string;
  notice_type: string;
  hearing_id?: string;
}): Promise<GenerateNoticeResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: 400, data: { error: parsed.error.issues[0]?.message ?? "Invalid request." } };
  }

  const request = new NextRequest("http://internal.local/api/notices", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      case_id: parsed.data.case_id,
      notice_type: parsed.data.notice_type,
      hearing_id: parsed.data.hearing_id,
    }),
  });

  const response = await createNoticeRoute(request);
  const data = (await response.json().catch(() => ({
    error: "Unexpected response from the server.",
  }))) as GenerateNoticeResponse;
  return { status: response.status, data };
}
