import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/server/supabase-admin", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/notices/render", () => ({
  renderNoticeTemplate: vi.fn(() => Buffer.from("rendered docx bytes")),
  buildNoticeTemplateData: vi.fn(() => ({})),
  TemplateRenderError: class TemplateRenderError extends Error {},
}));
vi.mock("@/lib/notices/email", async () => {
  const actual = await vi.importActual<typeof import("@/lib/notices/email")>("@/lib/notices/email");
  return { sendNoticeEmail: vi.fn(), noticeTypeLabel: actual.noticeTypeLabel };
});

import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { sendNoticeEmail } from "@/lib/notices/email";
import { POST } from "@/app/api/notices/route";

const CASE_ID = "bbbbbbbb-0000-4000-8000-000000000002";
const TEMPLATE_ID = "cccccccc-0000-4000-8000-000000000003";
const APPLICANT_ID = "p-applicant-1";
const MANAGEMENT_ID = "p-management-1";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/notices", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const CASE_ROW = {
  id: CASE_ID,
  file_number: "A/1/2026",
  act: "EC",
  section_id: null,
  office_code: "MAIN",
  subject: "Test case",
  memo_number: null,
  received_date: "2026-09-01",
  next_hearing_date: null,
  deleted_at: null,
};

const TEMPLATE_ROW = {
  id: TEMPLATE_ID,
  notice_type: "hearing",
  language: "en",
  name: "Hearing notice (EN)",
  active: true,
  docx_path: "templates/hearing-en.docx",
  whatsapp_template_name: null,
};

const PARTIES = [
  { id: APPLICANT_ID, role: "applicant", name: "Applicant One", email: "applicant@example.com", whatsapp_phone: null },
  { id: MANAGEMENT_ID, role: "management", name: "Management One", email: "management@example.com", whatsapp_phone: null },
];

function makeUserClient() {
  function builderFor(table: string) {
    const rows: Record<string, unknown> = { cases: CASE_ROW, notice_templates: TEMPLATE_ROW, parties: PARTIES };
    const value = rows[table];
    const chain = {
      eq: vi.fn(() => chain),
      is: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({ data: Array.isArray(value) ? null : (value ?? null), error: null })),
      then: (resolve: (v: { data: unknown; error: null }) => void) => resolve({ data: value ?? [], error: null }),
    };
    return chain;
  }
  return {
    auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: "user-1" } } })) },
    from: vi.fn((table: string) => ({ select: vi.fn(() => builderFor(table)) })),
  };
}

function makeAdminClient() {
  const notice = { id: "generated-notice-id", case_id: CASE_ID, template_id: TEMPLATE_ID, type: "hearing", status: "pending" };
  const insertedDeliveries = [
    { id: "delivery-applicant-email", notice_id: notice.id, party_id: APPLICANT_ID, channel: "email", recipient: "applicant@example.com", status: "pending" },
    { id: "delivery-management-email", notice_id: notice.id, party_id: MANAGEMENT_ID, channel: "email", recipient: "management@example.com", status: "pending" },
  ];

  const updateCalls: { id: string; payload: unknown }[] = [];

  const from = vi.fn((table: string) => {
    if (table === "notices") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })), // no existing notice
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({ single: vi.fn(async () => ({ data: notice, error: null })) })),
        })),
      };
    }
    if (table === "notice_deliveries") {
      return {
        insert: vi.fn(() => ({ select: vi.fn(async () => ({ data: insertedDeliveries, error: null })) })),
        update: vi.fn((payload: unknown) => ({
          eq: vi.fn(async (_col: string, id: string) => {
            updateCalls.push({ id, payload });
            return { error: null };
          }),
        })),
      };
    }
    throw new Error(`unexpected table in test: ${table}`);
  });

  const storage = {
    from: vi.fn(() => ({
      download: vi.fn(async () => ({ data: new Blob([Buffer.from("template bytes")]), error: null })),
      upload: vi.fn(async () => ({ error: null })),
    })),
  };

  return { from, storage, updateCalls };
}

describe("POST /api/notices — email sent directly, no Make.com", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockResolvedValue(makeUserClient() as never);
  });
  afterEach(() => vi.restoreAllMocks());

  it("emails both parties directly, records each delivery, and skips the Make.com webhook entirely", async () => {
    const admin = makeAdminClient();
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);
    vi.mocked(sendNoticeEmail)
      .mockResolvedValueOnce({ ok: true, providerMessageId: "msg-applicant" })
      .mockResolvedValueOnce({ ok: true, providerMessageId: "msg-management" });

    const res = await POST(makeRequest({ case_id: CASE_ID, notice_type: "hearing", template_id: TEMPLATE_ID }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(sendNoticeEmail).toHaveBeenCalledTimes(2);
    expect(sendNoticeEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "applicant@example.com", caseFileNumber: "A/1/2026", noticeTypeLabel: "Hearing Notice" }),
    );
    expect(sendNoticeEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "management@example.com" }));

    // Both delivery rows were updated to 'sent' with the provider message id.
    expect(admin.updateCalls).toHaveLength(2);
    for (const call of admin.updateCalls) {
      expect(call.payload).toMatchObject({ status: "sent", attempt_count: 1 });
    }

    // No WhatsApp deliveries exist for this notice, so Make.com is never contacted.
    expect(body.webhook).toMatch(/skipped: no WhatsApp deliveries/);
    expect(body.emailResults).toEqual([
      { party_id: APPLICANT_ID, recipient: "applicant@example.com", status: "sent" },
      { party_id: MANAGEMENT_ID, recipient: "management@example.com", status: "sent" },
    ]);
  });

  it("records a failed email delivery without failing the whole request", async () => {
    const admin = makeAdminClient();
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);
    vi.mocked(sendNoticeEmail)
      .mockResolvedValueOnce({ ok: false, error: "domain not verified" })
      .mockResolvedValueOnce({ ok: true, providerMessageId: "msg-management" });

    const res = await POST(makeRequest({ case_id: CASE_ID, notice_type: "hearing", template_id: TEMPLATE_ID }));
    const body = await res.json();

    expect(res.status).toBe(201);
    const failed = body.emailResults.find((r: { status: string }) => r.status === "failed");
    expect(failed).toMatchObject({ error: "domain not verified" });
    const failedUpdate = admin.updateCalls.find((c) => (c.payload as { status: string }).status === "failed");
    expect(failedUpdate?.payload).toMatchObject({ status: "failed", error: "domain not verified", attempt_count: 1 });
  });
});
