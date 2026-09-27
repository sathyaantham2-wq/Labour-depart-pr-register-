import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/server/supabase-admin", () => ({ getSupabaseAdmin: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { POST } from "@/app/api/notices/route";

const USER_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const CASE_ID = "bbbbbbbb-0000-4000-8000-000000000002";

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/notices", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

type Row = Record<string, unknown>;

// A minimal per-table query builder: .select().eq()...maybeSingle()/then-as-array.
// `tables[name]` supplies either a single row (terminates on maybeSingle) or an
// array of rows (terminates when the chain is awaited directly, as route.ts does
// for the plain `parties` list and the template-candidates lookup).
function makeUserClient(tables: Record<string, Row | Row[] | null>, signedIn = true) {
  function builderFor(name: string) {
    const rows = tables[name];
    const chain = {
      eq: vi.fn(() => chain),
      is: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({ data: (rows as Row) ?? null, error: null })),
      then: (resolve: (v: { data: Row[] | null; error: null }) => void) =>
        resolve({ data: (rows as Row[]) ?? [], error: null }),
    };
    return chain;
  }

  return {
    auth: {
      getClaims: vi.fn(async () => ({
        data: signedIn ? { claims: { sub: USER_ID } } : null,
      })),
    },
    from: vi.fn((table: string) => ({
      select: vi.fn(() => builderFor(table)),
    })),
  };
}

const BASE_CASE: Row = {
  id: CASE_ID,
  file_number: "A/1/2026",
  act: "EC",
  section_id: null,
  office_code: "MAIN",
  subject: "Test",
  memo_number: null,
  received_date: "2026-09-01",
  next_hearing_date: null,
  deleted_at: null,
};

const ACTIVE_TEMPLATE: Row = {
  id: "cccccccc-0000-4000-8000-000000000003",
  notice_type: "hearing",
  language: "en",
  name: "Hearing notice (EN)",
  active: true,
  docx_path: "templates/hearing-en.docx",
  whatsapp_template_name: null,
};

// Minimal admin client that only answers the idempotency lookup (no existing notice) — enough
// to let the route reach the delivery-planning check without needing full storage/insert mocks.
function makeAdminClientNoExistingNotice() {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })),
      })),
    })),
  };
}

describe("POST /api/notices — template resolution", () => {
  beforeEach(() => {
    vi.mocked(getSupabaseAdmin).mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it("rejects with 401 when there is no signed-in session", async () => {
    vi.mocked(createClient).mockResolvedValue(makeUserClient({}, false) as never);

    const res = await POST(makeRequest({ case_id: CASE_ID, notice_type: "hearing" }));

    expect(res.status).toBe(401);
    expect(getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("rejects with 404 when the case doesn't exist or isn't accessible (RLS)", async () => {
    vi.mocked(createClient).mockResolvedValue(makeUserClient({ cases: null }) as never);

    const res = await POST(makeRequest({ case_id: CASE_ID, notice_type: "hearing" }));

    expect(res.status).toBe(404);
  });

  it("rejects with 422 when no template_id is given and no active template matches notice_type", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeUserClient({ cases: BASE_CASE, notice_templates: [] }) as never,
    );

    const res = await POST(makeRequest({ case_id: CASE_ID, notice_type: "hearing" }));
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toMatch(/no active template/i);
  });

  it("rejects with 422 when no template_id is given and more than one active template matches", async () => {
    const secondTemplate = { ...ACTIVE_TEMPLATE, id: "dddddddd-0000-4000-8000-000000000004", language: "te" };
    vi.mocked(createClient).mockResolvedValue(
      makeUserClient({ cases: BASE_CASE, notice_templates: [ACTIVE_TEMPLATE, secondTemplate] }) as never,
    );

    const res = await POST(makeRequest({ case_id: CASE_ID, notice_type: "hearing" }));
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toMatch(/more than one active template/i);
    expect(body.candidates).toHaveLength(2);
  });

  it("rejects with 422 when neither party has an email or WhatsApp number on file", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeUserClient({
        cases: BASE_CASE,
        notice_templates: [ACTIVE_TEMPLATE],
        parties: [
          { id: "p1", role: "applicant", email: null, whatsapp_phone: null },
          { id: "p2", role: "management", email: null, whatsapp_phone: null },
        ],
        hearings: null,
      }) as never,
    );
    vi.mocked(getSupabaseAdmin).mockReturnValue(makeAdminClientNoExistingNotice() as never);

    const res = await POST(makeRequest({ case_id: CASE_ID, notice_type: "hearing" }));
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toMatch(/could never be delivered/i);
    expect(body.skippedDeliveries).toHaveLength(4); // 2 parties x 2 channels
  });

  it("rejects with 422 when an explicit template_id belongs to a different notice_type", async () => {
    const wrongTypeTemplate = { ...ACTIVE_TEMPLATE, notice_type: "closure" };
    vi.mocked(createClient).mockResolvedValue(
      makeUserClient({ cases: BASE_CASE, notice_templates: wrongTypeTemplate }) as never,
    );

    const res = await POST(
      makeRequest({ case_id: CASE_ID, notice_type: "hearing", template_id: ACTIVE_TEMPLATE.id }),
    );
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toMatch(/is for notice_type "closure"/);
  });

  it("rejects with 503 when the service-role client isn't configured", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeUserClient({
        cases: BASE_CASE,
        notice_templates: [ACTIVE_TEMPLATE],
        parties: [{ id: "p1", role: "applicant", email: "a@example.com", whatsapp_phone: null }],
        hearings: null,
      }) as never,
    );
    vi.mocked(getSupabaseAdmin).mockReturnValue(null);

    const res = await POST(makeRequest({ case_id: CASE_ID, notice_type: "hearing" }));

    expect(res.status).toBe(503);
  });
});
