import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
}));

import { sendNoticeEmail, noticeTypeLabel } from "@/lib/notices/email";

const BASE_INPUT = {
  to: "applicant@example.com",
  recipientName: "Test Applicant",
  caseFileNumber: "A/1/2026",
  noticeTypeLabel: "Hearing Notice",
  attachment: { filename: "Notice-A_1_2026.docx", content: Buffer.from("fake docx bytes") },
};

describe("sendNoticeEmail", () => {
  beforeEach(() => {
    sendMock.mockReset();
    vi.stubEnv("RESEND_API_KEY", "test-resend-key");
    vi.stubEnv("NOTICES_FROM_EMAIL", "Labour Dept <notices@example.gov.in>");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("returns a clear error when RESEND_API_KEY is not configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");

    const result = await sendNoticeEmail(BASE_INPUT);

    expect(result).toEqual({ ok: false, error: "Email is not configured: RESEND_API_KEY is not set." });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns a clear error when NOTICES_FROM_EMAIL is not configured", async () => {
    vi.stubEnv("NOTICES_FROM_EMAIL", "");

    const result = await sendNoticeEmail(BASE_INPUT);

    expect(result).toEqual({ ok: false, error: "Email is not configured: NOTICES_FROM_EMAIL is not set." });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends with the correct recipient, subject, attachment and from address", async () => {
    sendMock.mockResolvedValue({ data: { id: "msg_123" }, error: null });

    const result = await sendNoticeEmail(BASE_INPUT);

    expect(result).toEqual({ ok: true, providerMessageId: "msg_123" });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Labour Dept <notices@example.gov.in>",
        to: "applicant@example.com",
        subject: "Hearing Notice — Case A/1/2026",
        attachments: [{ filename: "Notice-A_1_2026.docx", content: BASE_INPUT.attachment.content }],
      }),
    );
    // The transmittal body names the case and recipient — it is not the notice itself
    // (that's the attached DOCX), just a plain covering message.
    const sentBody = sendMock.mock.calls[0][0].text as string;
    expect(sentBody).toContain("Test Applicant");
    expect(sentBody).toContain("A/1/2026");
  });

  it("returns ok:false with Resend's error message when the API rejects the request", async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: "domain not verified" } });

    const result = await sendNoticeEmail(BASE_INPUT);

    expect(result).toEqual({ ok: false, error: "domain not verified" });
  });

  it("returns ok:false when Resend accepts but returns no message id", async () => {
    sendMock.mockResolvedValue({ data: null, error: null });

    const result = await sendNoticeEmail(BASE_INPUT);

    expect(result.ok).toBe(false);
  });

  it("uses a generic transmittal message for an unrecognized notice type label", async () => {
    sendMock.mockResolvedValue({ data: { id: "msg_1" }, error: null });

    await sendNoticeEmail({ ...BASE_INPUT, noticeTypeLabel: "Something Unexpected" });

    const sentBody = sendMock.mock.calls[0][0].text as string;
    expect(sentBody).toContain("Please find attached a notice");
  });
});

describe("noticeTypeLabel", () => {
  it.each([
    ["hearing", "Hearing Notice"],
    ["show_cause", "Show Cause Notice"],
    ["closure", "Closure Notice"],
    ["order", "Order"],
    ["something_else", "Notice"],
  ])("maps %s -> %s", (type, label) => {
    expect(noticeTypeLabel(type)).toBe(label);
  });
});
