import { describe, expect, it } from "vitest";
import { parsePhoneJson, toPhoneJson } from "@/components/cases/party-schema";

describe("toPhoneJson", () => {
  it("drops entries with an empty phone number, keeping ones with a name filled in", () => {
    expect(toPhoneJson([{ name: "Son", phone: "" }, { name: "", phone: "9876543210" }])).toEqual([
      { phone: "9876543210" },
    ]);
  });

  it("trims whitespace from both name and phone", () => {
    expect(toPhoneJson([{ name: "  Son  ", phone: "  9876543210  " }])).toEqual([
      { name: "Son", phone: "9876543210" },
    ]);
  });

  it("omits the name key entirely when blank, rather than storing an empty string", () => {
    const [entry] = toPhoneJson([{ name: "", phone: "9876543210" }]);
    expect(entry).toEqual({ phone: "9876543210" });
    expect("name" in entry).toBe(false);
  });

  it("keeps the name key when a name is given", () => {
    expect(toPhoneJson([{ name: "Son", phone: "9876543210" }])).toEqual([
      { name: "Son", phone: "9876543210" },
    ]);
  });

  it("returns an empty array when given no entries or all-empty entries", () => {
    expect(toPhoneJson([])).toEqual([]);
    expect(toPhoneJson([{ name: "", phone: "" }, { name: "Nobody", phone: "   " }])).toEqual([]);
  });
});

describe("parsePhoneJson", () => {
  it("parses a well-formed array of phone entries", () => {
    expect(parsePhoneJson([{ name: "Son", phone: "9876543210" }, { phone: "1234567890" }])).toEqual([
      { name: "Son", phone: "9876543210" },
      { phone: "1234567890" },
    ]);
  });

  it("falls back to an empty array for null, undefined, or a non-array value", () => {
    expect(parsePhoneJson(null)).toEqual([]);
    expect(parsePhoneJson(undefined)).toEqual([]);
    expect(parsePhoneJson("9876543210")).toEqual([]);
    expect(parsePhoneJson({ phone: "9876543210" })).toEqual([]);
  });

  it("falls back to an empty array for a malformed element (old bare-string shape)", () => {
    expect(parsePhoneJson(["9876543210"])).toEqual([]);
  });

  it("round-trips through toPhoneJson", () => {
    const stored = toPhoneJson([{ name: "Son", phone: " 987 " }, { name: "", phone: "123" }]);
    expect(parsePhoneJson(stored)).toEqual(stored);
  });
});
