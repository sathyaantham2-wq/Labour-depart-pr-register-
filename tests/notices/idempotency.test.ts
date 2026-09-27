import { describe, expect, it, vi } from "vitest";
import { buildIdempotencyKey, findNoticeByIdempotencyKey } from "@/lib/notices/idempotency";

describe("buildIdempotencyKey", () => {
  it("uses hearing_id + notice_type when the notice is tied to a hearing", () => {
    expect(
      buildIdempotencyKey({ caseId: "case-1", hearingId: "hearing-1", noticeType: "hearing" }),
    ).toBe("hearing-1:hearing");
  });

  it("falls back to case_id + notice_type when there is no hearing_id", () => {
    expect(
      buildIdempotencyKey({ caseId: "case-1", hearingId: null, noticeType: "closure" }),
    ).toBe("case:case-1:closure");
  });

  it("prefers an explicit client-supplied key over the derived scheme", () => {
    expect(
      buildIdempotencyKey({
        caseId: "case-1",
        hearingId: "hearing-1",
        noticeType: "hearing",
        clientKey: "custom-key-42",
      }),
    ).toBe("custom-key-42");
  });

  it("ignores a blank/whitespace-only client key and falls back to the derived scheme", () => {
    expect(
      buildIdempotencyKey({
        caseId: "case-1",
        hearingId: "hearing-1",
        noticeType: "hearing",
        clientKey: "   ",
      }),
    ).toBe("hearing-1:hearing");
  });

  it("scopes different cases separately when neither has a hearing", () => {
    const keyA = buildIdempotencyKey({ caseId: "case-a", hearingId: null, noticeType: "closure" });
    const keyB = buildIdempotencyKey({ caseId: "case-b", hearingId: null, noticeType: "closure" });
    expect(keyA).not.toBe(keyB);
  });
});

// Minimal chainable Supabase query-builder mock: .from().select().eq().maybeSingle()
function makeSupabaseMock(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { from, select, eq, maybeSingle };
}

describe("findNoticeByIdempotencyKey", () => {
  it("returns the existing notice row instead of letting the route create a duplicate", async () => {
    const existingNotice = { id: "notice-1", idempotency_key: "hearing-1:hearing", status: "sent" };
    const supabase = makeSupabaseMock({ data: existingNotice, error: null });

    const result = await findNoticeByIdempotencyKey(supabase as never, "hearing-1:hearing");

    expect(result).toEqual(existingNotice);
    expect(supabase.from).toHaveBeenCalledWith("notices");
    expect(supabase.eq).toHaveBeenCalledWith("idempotency_key", "hearing-1:hearing");
  });

  it("returns null when no notice has that key yet, so the route proceeds to create one", async () => {
    const supabase = makeSupabaseMock({ data: null, error: null });
    const result = await findNoticeByIdempotencyKey(supabase as never, "hearing-2:hearing");
    expect(result).toBeNull();
  });

  it("propagates a query error instead of silently treating it as no-match", async () => {
    const supabase = makeSupabaseMock({ data: null, error: new Error("connection reset") });
    await expect(findNoticeByIdempotencyKey(supabase as never, "x")).rejects.toThrow(
      "connection reset",
    );
  });
});
