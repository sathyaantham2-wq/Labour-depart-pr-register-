import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/supabase-admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { POST } from "@/app/api/deliveries/callback/route";

const SECRET = "test-webhook-secret";

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/deliveries/callback", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

// Mimics .from("notice_deliveries").select("*").eq(...).maybeSingle() for the
// lookup, and .from("notice_deliveries").update(...).eq("id", ...).select("*").single()
// for the write. `existingRow: null` simulates no matching delivery row.
function makeAdminMock(existingRow: Record<string, unknown> | null, updatedRow: Record<string, unknown> | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: existingRow, error: null });
  const selectChain: { eq: ReturnType<typeof vi.fn>; maybeSingle: typeof maybeSingle } = {
    eq: vi.fn(),
    maybeSingle,
  };
  selectChain.eq.mockReturnValue(selectChain);

  const singleFn = vi.fn().mockResolvedValue({ data: updatedRow, error: null });
  const selectAfterUpdate = vi.fn().mockReturnValue({ single: singleFn });
  const eqAfterUpdate = vi.fn().mockReturnValue({ select: selectAfterUpdate });
  const updateFn = vi.fn().mockReturnValue({ eq: eqAfterUpdate });

  const from = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue(selectChain),
    update: updateFn,
  });

  return { from, updateFn, selectChain };
}

describe("POST /api/deliveries/callback", () => {
  beforeEach(() => {
    vi.stubEnv("MAKE_WEBHOOK_SECRET", SECRET);
    vi.mocked(getSupabaseAdmin).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects with 401 when the x-webhook-secret header is missing", async () => {
    const res = await POST(makeRequest({ delivery_id: "11111111-1111-4111-8111-111111111111", status: "sent" }));
    expect(res.status).toBe(401);
    expect(getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("rejects with 401 when the x-webhook-secret header is wrong", async () => {
    const res = await POST(
      makeRequest({ delivery_id: "11111111-1111-4111-8111-111111111111", status: "sent" }, { "x-webhook-secret": "wrong-secret" }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects everything with 503 when MAKE_WEBHOOK_SECRET is not configured at all", async () => {
    vi.stubEnv("MAKE_WEBHOOK_SECRET", "");
    const res = await POST(
      makeRequest({ delivery_id: "11111111-1111-4111-8111-111111111111", status: "sent" }, { "x-webhook-secret": "anything" }),
    );
    expect(res.status).toBe(503);
  });

  it("rejects with 400 for an invalid body shape (bad status enum)", async () => {
    const res = await POST(
      makeRequest({ delivery_id: "11111111-1111-4111-8111-111111111111", status: "not-a-real-status" }, { "x-webhook-secret": SECRET }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects with 400 when neither delivery_id nor the (notice_id, party_id, channel) triple is given", async () => {
    const res = await POST(makeRequest({ status: "sent" }, { "x-webhook-secret": SECRET }));
    expect(res.status).toBe(400);
  });

  it("updates the matching row with the right fields for a valid sent callback", async () => {
    const existingRow = {
      id: "11111111-1111-4111-8111-111111111111",
      notice_id: "33333333-3333-4333-8333-333333333333",
      party_id: "44444444-4444-4444-8444-444444444444",
      channel: "email",
      recipient: "a@example.com",
      status: "pending",
      provider_message_id: null,
      error: null,
      attempt_count: 0,
      sent_at: null,
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    const updatedRow = { ...existingRow, status: "sent", provider_message_id: "abc123", sent_at: "now" };
    const admin = makeAdminMock(existingRow, updatedRow);
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    const res = await POST(
      makeRequest(
        { delivery_id: "11111111-1111-4111-8111-111111111111", status: "sent", provider_message_id: "abc123" },
        { "x-webhook-secret": SECRET },
      ),
    );

    expect(res.status).toBe(200);
    expect(admin.updateFn).toHaveBeenCalledTimes(1);
    const updateArg = admin.updateFn.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg.status).toBe("sent");
    expect(updateArg.provider_message_id).toBe("abc123");
    expect(typeof updateArg.sent_at).toBe("string");
    expect(updateArg.attempt_count).toBeUndefined(); // only bumped on failure

    const body = await res.json();
    expect(body.delivery).toEqual(updatedRow);
  });

  it("increments attempt_count and records the error on a failed callback", async () => {
    const existingRow = {
      id: "22222222-2222-4222-8222-222222222222",
      notice_id: "33333333-3333-4333-8333-333333333333",
      party_id: "55555555-5555-4555-8555-555555555555",
      channel: "whatsapp",
      recipient: "+911234567890",
      status: "pending",
      provider_message_id: null,
      error: null,
      attempt_count: 2,
      sent_at: null,
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    const updatedRow = { ...existingRow, status: "failed", attempt_count: 3, error: "provider timeout" };
    const admin = makeAdminMock(existingRow, updatedRow);
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    const res = await POST(
      makeRequest(
        { notice_id: "33333333-3333-4333-8333-333333333333", party_id: "55555555-5555-4555-8555-555555555555", channel: "whatsapp", status: "failed", error: "provider timeout" },
        { "x-webhook-secret": SECRET },
      ),
    );

    expect(res.status).toBe(200);
    const updateArg = admin.updateFn.mock.calls[0][0] as Record<string, unknown>;
    expect(updateArg.attempt_count).toBe(3);
    expect(updateArg.error).toBe("provider timeout");
    expect(updateArg.sent_at).toBeUndefined();
  });

  it("returns 404 when no notice_deliveries row matches", async () => {
    const admin = makeAdminMock(null, null);
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    const res = await POST(
      makeRequest({ delivery_id: "99999999-9999-4999-8999-999999999999", status: "sent" }, { "x-webhook-secret": SECRET }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 503 when the service-role client isn't configured", async () => {
    vi.mocked(getSupabaseAdmin).mockReturnValue(null);
    const res = await POST(
      makeRequest({ delivery_id: "11111111-1111-4111-8111-111111111111", status: "sent" }, { "x-webhook-secret": SECRET }),
    );
    expect(res.status).toBe(503);
  });
});
