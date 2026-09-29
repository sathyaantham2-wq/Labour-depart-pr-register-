import { describe, expect, it } from "vitest";
import { ADMIN_NAV, NAV } from "@/components/layout/nav-items";
import { NAV_ICONS } from "@/components/layout/sidebar-nav";

const ALL = [...NAV, ...ADMIN_NAV];

describe("sidebar nav items", () => {
  // Regression: passing icon components in these props crashed every
  // authenticated page in production (RSC can't serialize functions).
  it("are plain serializable data (safe to pass to a Client Component)", () => {
    expect(JSON.parse(JSON.stringify(ALL))).toEqual(ALL);
    for (const item of ALL) {
      for (const value of Object.values(item)) expect(typeof value).toBe("string");
    }
  });

  it("have unique hrefs", () => {
    const hrefs = ALL.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("each have a dedicated icon", () => {
    for (const item of ALL) expect(NAV_ICONS[item.href], item.href).toBeDefined();
  });

  it("label the entries screen 'Current Entries', not 'Cases'", () => {
    expect(NAV.find((i) => i.href === "/cases")?.label).toBe("Current Entries");
  });
});
