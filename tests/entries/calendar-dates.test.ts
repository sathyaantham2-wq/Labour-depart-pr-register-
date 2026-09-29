import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  datesBetween,
  daysBetween,
  endOfMonth,
  isIsoDate,
  startOfWeek,
  todayIST,
} from "@/lib/calendar-dates";

describe("calendar-dates", () => {
  it("takes 'today' in IST, not UTC", () => {
    // 20:00 UTC on 28 Sep is 01:30 IST on 29 Sep.
    expect(todayIST(new Date("2026-09-28T20:00:00Z"))).toBe("2026-09-29");
  });

  it("does date arithmetic across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-01");
    expect(endOfMonth("2028-02-10")).toBe("2028-02-29");
  });

  it("starts weeks on Monday", () => {
    expect(startOfWeek("2026-09-29")).toBe("2026-09-28"); // Tuesday -> Monday
    expect(startOfWeek("2026-10-04")).toBe("2026-09-28"); // Sunday -> previous Monday
    expect(startOfWeek("2026-09-28")).toBe("2026-09-28");
  });

  it("validates real calendar dates only", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-9-1")).toBe(false);
    expect(isIsoDate("2026-09-01")).toBe(true);
  });

  it("counts and lists days", () => {
    expect(daysBetween("2026-09-01", "2026-09-29")).toBe(28);
    expect(datesBetween("2026-09-28", "2026-10-04")).toHaveLength(7);
  });
});
