import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/server/supabase-admin", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/notices/email", () => ({
  sendNoticeEmail: vi.fn(),
  noticeTypeLabel: (type: string) => (type === "hearing" ? "Hearing Notice" : type),
}));

import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { sendNoticeEmail } from "@/lib/notices/email";
import { POST } from "@/app/api/notices/deliveries/[id]/retry/route";

const USER_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const DELIVERY_ID = "11111111-1111-4111-8111-111111111111";
const NOTICE_ID = "22222222-2222-4222-8222-222222222222";
const PARTY_ID = "33333333-3333-4333-8333-333333333333";
const CASE_ID = "44444444-4444-4444-8444-444444444444";

function makeRequest() {
  return new NextRequest(`http://localhost/api/notices/deliveries/${DELIVERY_ID}/retry`, {
    method: "POST",
  });
}

function invoke() {
  return POST(makeRequest(), { params: Promise.resolve({ id: DELIVERY_ID }) });
}

type Row = Record<string, unknown>;

// Mimics userClient.from("notice_deliveries").select("*").eq("id", ...).maybeSingle().
function makeUserClient(deliveryRow: Row | null, signedIn = true) {
  const maybeSingle = vi.fn(async () => ({ data: deliveryRow, error: null }));
  const chain = { eq: vi.fn(() => chain), maybeSingle };
  return {
    auth: {
      getClaims: vi.fn(async () => ({
        data: signedIn ? { claims: { sub: USER_ID } } : null,
      })),
    },
    from: vi.fn(() => ({ select: vi.fn(() => chain) })),
  };
}

const BASE_DELIVERY: Row = {
  id: DELIVERY_ID,
  notice_id: NOTICE_ID,
  party_id: PARTY_ID,
  channel: "email",
  recipient: "applicant@example.com",
  status: "failed",
  provider_message_id: null,
  error: "Resend rejected the email.",
  attempt_count: 1,
  sent_at: null,
  updated_at: "2026-01-01T00:00:00.000Z",
};

const BASE_NOTICE: Row = {
  id: NOTICE_ID,
  case_id: CASE_ID,
  type: "hearing",
  doc_path: `cases/${CASE_ID}/${NOTICE_ID}.docx`,
};

const BASE_PARTY: Row = {
  id: PARTY_ID,
  name: "Applicant Name",
  role: "applicant",
};

const BASE_CASE: Row = {
  id: CASE_ID,
  file_number: "A/1/2026",
};

// Full admin mock: table lookups for notices/parties/cases (each select().eq().maybeSingle()),
// storage.download, and the final notice_deliveries update().eq().select().single().
function makeAdminClient(opts: {
  notice?: Row | null;
  party?: Row | null;
  caseRow?: Row | null;
  downloadOk?: boolean;
  updatedRow?: Row | null;
}) {
  const {
    notice = BASE_NOTICE,
    party = BASE_PARTY,
    caseRow = BASE_CASE,
    downloadOk = true,
    updatedRow = { ...BASE_DELIVERY, status: "sent" },
  } = opts;

  function maybeSingleFor(row: Row | null) {
    const chain = { eq: vi.fn(() => chain), maybeSingle: vi.fn(async () => ({ data: row, error: null })) };
    return chain;
  }

  const singleFn = vi.fn(async () => ({ data: updatedRow, error: null }));
  const updateSelect = vi.fn().mockReturnValue({ single: singleFn });
  const updateEq = vi.fn().mockReturnValue({ select: updateSelect });
  // Untyped vi.fn() (rather than vi.fn(() => ...)) on purpose, matching
  // tests/notices/callback.test.ts's makeAdminMock — so `.mock.calls[0][0]` below can be
  // indexed without TS inferring an empty-tuple parameter list from an arrow function.
  const updateFn = vi.fn().mockReturnValue({ eq: updateEq });

  const from = vi.fn((table: string) => {
    if (table === "notices") return { select: vi.fn(() => maybeSingleFor(notice)) };
    if (table === "parties") return { select: vi.fn(() => maybeSingleFor(party)) };
    if (table === "cases") return { select: vi.fn(() => maybeSingleFor(caseRow)) };
    if (table === "notice_deliveries") return { update: updateFn };
    throw new Error(`Unexpected table in test: ${table}`);
  });

  const download = vi.fn(async () =>
    downloadOk
      ? { data: { arrayBuffer: async () => new ArrayBuffer(8) }, error: null }
      : { data: null, error: new Error("not found") },
  );
  const storage = { from: vi.fn(() => ({ download })) };

  return { from, storage, updateFn };
}

describe("POST /api/notices/deliveries/[id]/retry", () => {
  beforeEach(() => {
    vi.mocked(getSupabaseAdmin).mockReset();
    vi.mocked(sendNoticeEmail).mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it("rejects with 401 when there is no signed-in session", async () => {
    vi.mocked(createClient).mockResolvedValue(makeUserClient(BASE_DELIVERY, false) as never);

    const res = await invoke();

    expect(res.status).toBe(401);
    expect(getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("rejects with 404 when the delivery doesn't exist or isn't accessible (RLS)", async () => {
    vi.mocked(createClient).mockResolvedValue(makeUserClient(null) as never);

    const res = await invoke();

    expect(res.status).toBe(404);
  });

  it("rejects with 400 for a whatsapp delivery, pointing at Make.com Scenario 3", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeUserClient({ ...BASE_DELIVERY, channel: "whatsapp" }) as never,
    );

    const res = await invoke();
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/Scenario 3/);
    expect(getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("rejects with 400 when the delivery status isn't failed", async () => {
    vi.mocked(createClient).mockResolvedValue(makeUserClient({ ...BASE_DELIVERY, status: "sent" }) as never);

    const res = await invoke();
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/only failed deliveries/i);
  });

  it("rejects with 400 when attempt_count is already at the max", async () => {
    vi.mocked(createClient).mockResolvedValue(makeUserClient({ ...BASE_DELIVERY, attempt_count: 3 }) as never);

    const res = await invoke();
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/maximum number of times/i);
  });

  it("rejects with 503 when the service-role client isn't configured", async () => {
    vi.mocked(createClient).mockResolvedValue(makeUserClient(BASE_DELIVERY) as never);
    vi.mocked(getSupabaseAdmin).mockReturnValue(null);

    const res = await invoke();

    expect(res.status).toBe(503);
  });

  it("on send success: updates the row to sent, clears error, and increments attempt_count", async () => {
    vi.mocked(createClient).mockResolvedValue(makeUserClient(BASE_DELIVERY) as never);
    vi.mocked(sendNoticeEmail).mockResolvedValue({ ok: true, providerMessageId: "msg-123" });
    const updatedRow = {
      ...BASE_DELIVERY,
      status: "sent",
      provider_message_id: "msg-123",
      error: null,
      attempt_count: 2,
      sent_at: "2026-09-27T00:00:00.000Z",
    };
    const admin = makeAdminClient({ updatedRow });
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    const res = await invoke();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(sendNoticeEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: BASE_DELIVERY.recipient,
        recipientName: BASE_PARTY.name,
        caseFileNumber: BASE_CASE.file_number,
        noticeTypeLabel: "Hearing Notice",
        attachment: expect.objectContaining({ filename: "Notice-A_1_2026.docx" }),
      }),
    );
    const updateArg = admin.updateFn.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg.status).toBe("sent");
    expect(updateArg.provider_message_id).toBe("msg-123");
    expect(updateArg.error).toBeNull();
    expect(updateArg.attempt_count).toBe(2);
    expect(typeof updateArg.sent_at).toBe("string");
    expect(body.delivery).toEqual(updatedRow);
  });

  it("on send failure: updates the row to failed with the error, attempt_count still incremented", async () => {
    vi.mocked(createClient).mockResolvedValue(makeUserClient(BASE_DELIVERY) as never);
    vi.mocked(sendNoticeEmail).mockResolvedValue({ ok: false, error: "Resend rejected the email again." });
    const updatedRow = {
      ...BASE_DELIVERY,
      status: "failed",
      error: "Resend rejected the email again.",
      attempt_count: 2,
    };
    const admin = makeAdminClient({ updatedRow });
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    const res = await invoke();
    const body = await res.json();

    // Still 200: the retry attempt itself succeeded (was made and recorded); the send outcome
    // is reflected in the returned row, not the HTTP status.
    expect(res.status).toBe(200);
    const updateArg = admin.updateFn.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg.status).toBe("failed");
    expect(updateArg.error).toBe("Resend rejected the email again.");
    expect(updateArg.attempt_count).toBe(2);
    expect(updateArg.provider_message_id).toBeUndefined();
    expect(body.delivery).toEqual(updatedRow);
  });

  it("returns 500 if the stored document can't be downloaded", async () => {
    vi.mocked(createClient).mockResolvedValue(makeUserClient(BASE_DELIVERY) as never);
    const admin = makeAdminClient({ downloadOk: false });
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    const res = await invoke();

    expect(res.status).toBe(500);
    expect(sendNoticeEmail).not.toHaveBeenCalled();
  });
});
