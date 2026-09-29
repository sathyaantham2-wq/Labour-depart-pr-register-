import { describe, expect, it } from "vitest";
import { createCaseSchema, partyHasDetails } from "@/app/(app)/cases/case-schema";
import { buildDefaultMapping } from "@/lib/data-import/mapping";

const emptyParty = { name: "", phone: [{ name: "", phone: "" }], whatsapp_phone: "", email: "", address: "" };

function input(overrides: Record<string, unknown> = {}) {
  return {
    file_number: "A/1/2026",
    act: "",
    received_date: "2026-09-29",
    memo_number: "",
    subject: "",
    received_from_id: "",
    section_id: "",
    applicant: emptyParty,
    management: emptyParty,
    remark_text: "",
    remark_url: "",
    next_hearing_date: "",
    status: "open",
    amount_recovered: "",
    ...overrides,
  };
}

describe("createCaseSchema (office register form)", () => {
  it("accepts just the two required fields", () => {
    expect(createCaseSchema.safeParse(input()).success).toBe(true);
  });

  it("requires File Number and Submission Date", () => {
    const result = createCaseSchema.safeParse(input({ file_number: "", received_date: "" }));
    expect(result.success).toBe(false);
    const paths = result.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["file_number", "received_date"]));
  });

  it("allows management details without a Management Name (register has no such column)", () => {
    const result = createCaseSchema.safeParse(
      input({ management: { ...emptyParty, email: "hr@example.com", address: "Madhapur, Hyderabad" } }),
    );
    expect(result.success).toBe(true);
  });

  it("still requires Applicant Name when applicant details are given", () => {
    const result = createCaseSchema.safeParse(input({ applicant: { ...emptyParty, email: "a@example.com" } }));
    expect(result.success).toBe(false);
    expect(result.error!.issues[0].path).toEqual(["applicant", "name"]);
  });

  it("partyHasDetails ignores blank phone rows", () => {
    expect(partyHasDetails({ ...emptyParty, phone: [{ name: "Office", phone: "  " }] })).toBe(false);
    expect(partyHasDetails({ ...emptyParty, phone: [{ name: "", phone: "9876543210" }] })).toBe(true);
  });
});

describe("data import recognises the office register's own headers", () => {
  it("maps Submission Date and Receive From", () => {
    const mapping = buildDefaultMapping(["File Number", "Receive From", "Submission Date"]);
    expect(mapping.received_date).toBe("Submission Date");
    expect(mapping.received_from_name).toBe("Receive From");
  });
});
