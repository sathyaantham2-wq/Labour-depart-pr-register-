import { describe, expect, it } from "vitest";
import { formatRupees } from "@/lib/format-money";

describe("formatRupees", () => {
  it("uses Indian digit grouping", () => {
    expect(formatRupees(1234567)).toBe("₹12,34,567");
    expect(formatRupees(0)).toBe("₹0");
  });

  it("keeps up to two decimals", () => {
    expect(formatRupees(2500.5)).toBe("₹2,500.5");
    expect(formatRupees(10.256)).toBe("₹10.26");
  });
});
