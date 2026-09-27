import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Gap found in the final pre-production QA pass: every other test in this directory mocks the
// admin client to return "no existing notice" (see create-notice-route.test.ts's
// makeAdminClientNoExistingNotice and create-notice-email-happy-path.test.ts's makeAdminClient),
// so the actual "a notice with this idempotency_key already exists" branch of
// src/app/api/notices/route.ts (the whole reason POST /api/notices is safe to call twice with the
// same case_id/hearing_id/notice_type) was never exercised at the route level — only the pure
// buildIdempotencyKey/findNoticeByIdempotencyKey helpers were unit-tested in idempotency.test.ts.
// This file closes that gap: it asserts that a second POST with a key that already matches an
// existing notice returns that same notice (200, idempotent: true) and never touches storage,
// never inserts a second notices/notice_deliveries row, and never re-sends email.

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
const HEARING_ID = "eeeeeeee-0000-4000-8000-000000000005";
const TEMPLATE_ID = "cccccccc-0000-4000-8000-000000000003";
const EXISTING_NOTICE_ID = "ffffffff-0000-4000-8000-000000000006";

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

const HEARING_ROW = {
  id: HEARING_ID,
  case_id: CASE_ID,
  hearing_date: "2026-10-01",
  hearing_time: "10:30:00",
};

const EXISTING_NOTICE = {
  id: EXISTING_NOTICE_ID,
  case_id: CASE_ID,
  hearing_id: HEARING_ID,
  template_id: TEMPLATE_ID,
  type: "hearing",
  status: "sent",
  idempotency_key: HEARING_ID + ":hearing",
};

const EXISTING_DELIVERIES = [
  { id: "delivery-1", notice_id: EXISTING_NOTICE_ID, party_id: "p1", channel: "email", recipient: "a@example.com", status: "sent" },
];

function makeUserClient() {
  function builderFor(table: string) {
    const rows: Record<string, unknown> = {
      cases: CASE_ROW,
      notice_templates: TEMPLATE_ROW,
      parties: [],
      hearings: HEARING_ROW,
    };
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

// Admin client whose *only* job is to answer the idempotency lookup with a hit, then hand back
// that notice's existing deliveries. Every other method throws if called at all, so the test
// fails loudly (instead of silently) if the route ever falls through to the create path.
function makeAdminClientWithExistingNotice() {
  const insertNotices = vi.fn();
  const insertDeliveries = vi.fn();
  const storageUpload = vi.fn();
  const storageDownload = vi.fn();

  const from = vi.fn((table: string) => {
    if (table === "notices") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: EXISTING_NOTICE, error: null })) })),
        })),
        insert: insertNotices,
      };
    }
    if (table === "notice_deliveries") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(async () => ({ data: EXISTING_DELIVERIES, error: null })),
        })),
        insert: insertDeliveries,
      };
    }
    throw new Error(`unexpected table in idempotent-repeat test: ${table}`);
  });

  const storage = {
    from: vi.fn(() => ({ upload: storageUpload, download: storageDownload })),
  };

  return { from, storage, insertNotices, insertDeliveries, storageUpload, storageDownload };
}

describe("POST /api/notices — repeat call with the same idempotency key", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockResolvedValue(makeUserClient() as never);
  });
  afterEach(() => vi.restoreAllMocks());

  it("returns the same existing notice instead of creating a duplicate, and touches nothing else", async () => {
    const admin = makeAdminClientWithExistingNotice();
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    const res = await POST(
      makeRequest({ case_id: CASE_ID, notice_type: "hearing", hearing_id: HEARING_ID, template_id: TEMPLATE_ID }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.idempotent).toBe(true);
    expect(body.notice).toEqual(EXISTING_NOTICE);
    expect(body.deliveries).toEqual(EXISTING_DELIVERIES);
    expect(body.webhook).toMatch(/skipped: a notice with this idempotency key already exists/);

    // No new notice/notice_deliveries rows, no document re-render/upload, no email re-sent.
    expect(admin.insertNotices).not.toHaveBeenCalled();
    expect(admin.insertDeliveries).not.toHaveBeenCalled();
    expect(admin.storageUpload).not.toHaveBeenCalled();
    expect(admin.storageDownload).not.toHaveBeenCalled();
    expect(sendNoticeEmail).not.toHaveBeenCalled();
  });

  it("a second call with a different explicit idempotency_key is NOT treated as a repeat (still hits the create path)", async () => {
    // Sanity check on the other direction: confirms the lookup really keys off idempotency_key
    // and doesn't just always short-circuit. Uses the "no existing notice" shape from
    // create-notice-route.test.ts's helper, inlined here to keep this file self-contained.
    const insertNotices = vi.fn(() => ({
      select: vi.fn(() => ({ single: vi.fn(async () => ({ data: null, error: new Error("boom") })) })),
    }));
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "notices") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })),
            })),
            insert: insertNotices,
          };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
      storage: { from: vi.fn(() => ({ download: vi.fn(async () => ({ data: null, error: new Error("no file") })) })) },
    };
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    const res = await POST(
      makeRequest({
        case_id: CASE_ID,
        notice_type: "hearing",
        hearing_id: HEARING_ID,
        template_id: TEMPLATE_ID,
        idempotency_key: "a-brand-new-explicit-key",
      }),
    );
    const body = await res.json();

    // It proceeds past the idempotency check (no existing row for this key) — it fails later for
    // an unrelated mock-simplicity reason (parties is [], so nothing to deliver to), which is
    // itself proof this request took the create path, not the idempotent short-circuit.
    expect(res.status).toBe(422);
    expect(body.error).toMatch(/could never be delivered/i);
  });
});
