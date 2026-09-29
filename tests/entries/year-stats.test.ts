import { describe, expect, it } from "vitest";
import { availableYears, computeYearStats, parseYear, sectionKey, type YearCaseRow } from "@/lib/entries/year-stats";

const row = (over: Partial<YearCaseRow>): YearCaseRow => ({
  act: "EC",
  section_id: "s1",
  status: "open",
  received_date: "2025-03-01",
  closed_at: null,
  amount_recovered: null,
  ...over,
});

describe("computeYearStats", () => {
  const rows = [
    row({ received_date: "2024-06-01", status: "closed", closed_at: "2024-12-31" }), // closed before 2025: not in 2025 or 2026
    row({ received_date: "2025-03-01" }), // open at end of 2025 -> carried into 2026
    row({ received_date: "2025-04-01", status: "closed", closed_at: "2025-08-10", amount_recovered: "1500.50" }),
    row({ received_date: "2025-05-01", status: "closed", closed_at: "2026-02-01", amount_recovered: 700 }), // closed after 2025
    row({ received_date: "2025-06-01", status: "forwarded" }),
    row({ received_date: "2026-01-15" }),
    row({ received_date: "2026-02-20", section_id: "s2" }),
  ];

  it("2025: counts received, closed, forwarded and open", () => {
    const { totals } = computeYearStats(rows, 2025);
    expect(totals.total).toBe(4); // the 2024 entry closed in 2024 is excluded
    expect(totals.broughtForward).toBe(0);
    expect(totals.received).toBe(4);
    expect(totals.closed).toBe(1);
    expect(totals.forwarded).toBe(1);
    expect(totals.open).toBe(2); // one open + one closed only in 2026
    expect(totals.recovered).toBe(1500.5);
  });

  it("2026: entries not closed in 2025 are brought forward", () => {
    const { totals } = computeYearStats(rows, 2026);
    expect(totals.broughtForward).toBe(3); // open, forwarded, and the one closed in Feb 2026
    expect(totals.received).toBe(2);
    expect(totals.total).toBe(5);
    expect(totals.closed).toBe(1);
    expect(totals.recovered).toBe(700);
    expect(totals.total).toBe(totals.open + totals.closed + totals.forwarded);
  });

  it("splits by act and section", () => {
    const { bySection } = computeYearStats(rows, 2026);
    expect(bySection.get(sectionKey("EC", "s2"))?.received).toBe(1);
    expect(bySection.get(sectionKey("EC", "s1"))?.total).toBe(4);
  });

  it("uses the received date when a closed entry has no closed_at", () => {
    const { totals } = computeYearStats([row({ status: "closed", received_date: "2025-05-05" })], 2025);
    expect(totals.closed).toBe(1);
  });
});

describe("years", () => {
  it("lists years from the earliest entry to the current year, newest first", () => {
    expect(availableYears([{ received_date: "2024-02-02" }, { received_date: "2025-01-01" }], 2026)).toEqual([2026, 2025, 2024]);
    expect(availableYears([], 2026)).toEqual([2026]);
  });

  it("falls back to the current year for bad input", () => {
    expect(parseYear("2025", 2026)).toBe(2025);
    expect(parseYear("abc", 2026)).toBe(2026);
    expect(parseYear("1800", 2026)).toBe(2026);
    expect(parseYear(undefined, 2026)).toBe(2026);
  });
});
