import { describe, expect, it } from "vitest";
import { excelDateSerial } from "@/lib/entries/excel";
import { parseEntryFilters, REGISTER_COLUMNS } from "@/lib/entries/filters";

describe("excelDateSerial", () => {
  it("matches Excel's own serials", () => {
    expect(excelDateSerial("1900-03-01")).toBe(61);
    expect(excelDateSerial("2026-09-29")).toBe(46294);
  });
  it("ignores a time part and rejects junk", () => {
    expect(excelDateSerial("2026-09-29T23:30:00+05:30")).toBe(46294);
    expect(excelDateSerial(null)).toBeNull();
    expect(excelDateSerial("29/09/2026")).toBeNull();
  });
});

describe("parseEntryFilters", () => {
  it("strips PostgREST syntax characters from the search text", () => {
    expect(parseEntryFilters({ q: "A/1,(2)" }).q).toBe("A/1 2");
  });
  it("drops invalid ids, statuses and dates instead of passing them to the query", () => {
    const f = parseEntryFilters({ section_id: "x", status: "bogus", from: "2026-13", to: "2026-09-29" });
    expect(f.sectionId).toBeUndefined();
    expect(f.status).toBeUndefined();
    expect(f.from).toBeUndefined();
    expect(f.to).toBe("2026-09-29");
  });
  it("export and list share the office register's 15 columns", () => {
    expect(REGISTER_COLUMNS).toHaveLength(15);
    expect(REGISTER_COLUMNS[0]).toBe("File Number");
    expect(REGISTER_COLUMNS[14]).toBe("Submission Date");
  });
});
