import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildNoticeTemplateData, renderNoticeTemplate, TemplateRenderError } from "@/lib/notices/render";

const fixturePath = path.resolve(__dirname, "../fixtures/sample-template.docx");

// tests/fixtures/sample-template.docx is a deliberately plain, obviously-labeled
// test fixture (NOT a real Labour Department letterhead) with placeholders:
// {file_number} {subject} {applicant_name} {hearing_date} {today_date}.

describe("buildNoticeTemplateData", () => {
  it("includes case, applicant/management and hearing fields when present", () => {
    const data = buildNoticeTemplateData({
      caseFields: {
        file_number: "EC/12/2026",
        subject: "Non-payment of wages",
        act: "Payment of Wages Act",
        memo_number: "MEMO-99",
        received_date: "2026-01-05",
        next_hearing_date: "2026-02-10",
        office_code: "HYD-01",
      },
      parties: [
        {
          role: "applicant",
          name: "A. Kumar",
          address: "12 Market St",
          email: "a@example.com",
          phone: ["9000000001"],
          whatsapp_phone: "9000000001",
        },
        {
          role: "management",
          name: "ACME Textiles",
          address: null,
          email: null,
          phone: [],
          whatsapp_phone: null,
        },
      ],
      hearing: { hearing_date: "2026-02-10", hearing_time: "11:00" },
    });

    expect(data.file_number).toBe("EC/12/2026");
    expect(data.memo_number).toBe("MEMO-99");
    expect(data.next_hearing_date).toBe("10-02-2026");
    expect(data.hearing_date).toBe("10-02-2026");
    expect(data.hearing_time).toBe("11:00");
    expect(data.applicant_name).toBe("A. Kumar");
    expect(data.applicant_phone).toBe("9000000001");
    expect(data.management_name).toBe("ACME Textiles");
    // Management has no email/address/whatsapp on file -> keys omitted, not blank.
    expect(data.management_email).toBeUndefined();
    expect(data.management_address).toBeUndefined();
    expect(typeof data.today_date).toBe("string");
  });

  it("omits hearing_* keys entirely when there is no hearing", () => {
    const data = buildNoticeTemplateData({
      caseFields: {
        file_number: "EC/1/2026",
        subject: "x",
        act: "y",
        memo_number: null,
        received_date: "2026-01-01",
        next_hearing_date: null,
        office_code: "HYD-01",
      },
      parties: [],
      hearing: null,
    });
    expect(data.hearing_date).toBeUndefined();
    expect(data.hearing_time).toBeUndefined();
  });
});

describe("renderNoticeTemplate", () => {
  it("renders the sample fixture when every placeholder has matching data", () => {
    const buffer = fs.readFileSync(fixturePath);
    const data = buildNoticeTemplateData({
      caseFields: {
        file_number: "EC/12/2026",
        subject: "Non-payment of wages",
        act: "Payment of Wages Act",
        memo_number: null,
        received_date: "2026-01-05",
        next_hearing_date: null,
        office_code: "HYD-01",
      },
      parties: [
        { role: "applicant", name: "A. Kumar", address: null, email: "a@example.com", phone: [], whatsapp_phone: null },
      ],
      hearing: { hearing_date: "2026-02-10", hearing_time: "11:00" },
    });

    const result = renderNoticeTemplate(buffer, data);
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it("throws a TemplateRenderError naming every unmatched placeholder", () => {
    const buffer = fs.readFileSync(fixturePath);
    // The fixture needs file_number, subject, applicant_name, hearing_date and
    // today_date — only give it two of those.
    const incompleteData = { today_date: "27-09-2026", file_number: "EC/1/2026" };

    let caught: unknown;
    try {
      renderNoticeTemplate(buffer, incompleteData);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(TemplateRenderError);
    const err = caught as TemplateRenderError;
    expect(err.missingPlaceholders).toEqual(
      expect.arrayContaining(["subject", "applicant_name", "hearing_date"]),
    );
    expect(err.message).toContain("subject");
  });

  it("throws a TemplateRenderError for a file that isn't a valid zip/docx", () => {
    const notADocx = Buffer.from("this is definitely not a docx file");
    expect(() => renderNoticeTemplate(notADocx, {})).toThrow(TemplateRenderError);
  });
});
