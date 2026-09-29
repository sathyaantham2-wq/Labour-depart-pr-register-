import { describe, expect, it } from "vitest";
import { parseIntent } from "@/lib/chatbot/intent";

const TODAY = "2026-09-29"; // a Tuesday
const parse = (m: string, sections: string[] = []) => parseIntent(m, TODAY, sections);

describe("parseIntent", () => {
  it("greets and lists help", () => {
    expect(parse("hi").kind).toBe("greeting");
    expect(parse("help").kind).toBe("greeting");
  });

  it("counts entries by status", () => {
    expect(parse("How many open entries?")).toMatchObject({ kind: "count", status: "open" });
    expect(parse("number of closed cases")).toMatchObject({ kind: "count", status: "closed" });
    expect(parse("how many forwarded")).toMatchObject({ kind: "count", status: "forwarded" });
    expect(parse("total entries")).toMatchObject({ kind: "count", status: undefined });
  });

  it("understands brought-forward and received by year", () => {
    expect(parse("entries brought forward this year")).toMatchObject({
      kind: "count",
      scope: "brought_forward",
      year: 2026,
    });
    expect(parse("how many received in 2025")).toMatchObject({ kind: "count", scope: "received", year: 2025 });
  });

  it("matches a section by name", () => {
    expect(parse("open entries in Section 7A", ["Section 7A", "Section 2"])).toMatchObject({
      kind: "count",
      sectionName: "Section 7A",
    });
  });

  it("handles pending-age and no-hearing questions", () => {
    expect(parse("entries pending more than 90 days")).toMatchObject({ kind: "count", olderThanDays: 90, status: "open" });
    expect(parse("open entries with no hearing")).toMatchObject({ kind: "count", noHearing: true, status: "open" });
  });

  it("resolves hearing ranges in IST calendar terms", () => {
    expect(parse("hearings today")).toMatchObject({ kind: "hearings", from: TODAY, to: TODAY });
    expect(parse("hearings tomorrow")).toMatchObject({ kind: "hearings", from: "2026-09-30", to: "2026-09-30" });
    expect(parse("hearings this week")).toMatchObject({ kind: "hearings", from: "2026-09-28", to: "2026-10-04" });
    expect(parse("hearings next week")).toMatchObject({ kind: "hearings", from: "2026-10-05", to: "2026-10-11" });
    expect(parse("hearings this month")).toMatchObject({ kind: "hearings", from: "2026-09-01", to: "2026-09-30" });
  });

  it("asks about amounts recovered", () => {
    expect(parse("amount recovered this year")).toMatchObject({ kind: "recovered", year: 2026 });
    expect(parse("how much was recovered")).toMatchObject({ kind: "recovered" });
  });

  it("answers how-to questions", () => {
    expect(parse("how do I create a new entry?")).toMatchObject({ kind: "faq", topic: "new_entry" });
    expect(parse("how do I export to excel")).toMatchObject({ kind: "faq", topic: "export" });
    expect(parse("how do I generate a notice")).toMatchObject({ kind: "faq", topic: "notice" });
    expect(parse("what is carry forward")).toMatchObject({ kind: "faq", topic: "carry_forward" });
    expect(parse("who can see all entries")).toMatchObject({ kind: "faq", topic: "roles" });
  });

  it("finds entries by file number or name", () => {
    expect(parse("status of file 123/2025")).toMatchObject({ kind: "find", term: "123/2025" });
    expect(parse("find Ramesh")).toMatchObject({ kind: "find", term: "Ramesh" });
    expect(parse("EC/45/2024")).toMatchObject({ kind: "find" });
  });

  it("falls back for gibberish", () => {
    expect(parse("tell me a long story about something completely unrelated to anything")).toEqual({ kind: "unknown" });
  });
});
