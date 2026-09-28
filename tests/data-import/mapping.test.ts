import { describe, expect, it } from "vitest";
import {
  buildDefaultMapping,
  excelSerialToISODate,
  extractMappedRow,
  normalizeDate,
  normalizeHeaderText,
  normalizeStatus,
  resolveByName,
  validateRows,
  type CaseImportField,
  type MappedRowInput,
} from "@/lib/data-import/mapping";

describe("normalizeHeaderText", () => {
  it("lowercases, strips punctuation/underscores, and collapses whitespace", () => {
    expect(normalizeHeaderText("File_No.")).toBe("file no");
    expect(normalizeHeaderText("  FILE   NO  ")).toBe("file no");
    expect(normalizeHeaderText("Received-Date")).toBe("received date");
  });
});

describe("excelSerialToISODate", () => {
  it("converts a known Excel serial to the matching ISO date", () => {
    // 44562 is 2022-01-01 in Excel's date system.
    expect(excelSerialToISODate(44562)).toBe("2022-01-01");
  });

  it("returns null for non-finite or non-positive input", () => {
    expect(excelSerialToISODate(Number.NaN)).toBeNull();
    expect(excelSerialToISODate(0)).toBeNull();
    expect(excelSerialToISODate(-5)).toBeNull();
  });
});

describe("normalizeDate", () => {
  it("accepts ISO YYYY-MM-DD", () => {
    expect(normalizeDate("2023-03-05")).toBe("2023-03-05");
  });

  it("accepts DD-MM-YYYY", () => {
    expect(normalizeDate("05-03-2023")).toBe("2023-03-05");
  });

  it("accepts DD/MM/YYYY", () => {
    expect(normalizeDate("05/03/2023")).toBe("2023-03-05");
  });

  it("accepts DD.MM.YYYY", () => {
    expect(normalizeDate("05.03.2023")).toBe("2023-03-05");
  });

  it("accepts a 2-digit year, pivoting at 50", () => {
    expect(normalizeDate("05-03-23")).toBe("2023-03-05");
    expect(normalizeDate("05-03-71")).toBe("1971-03-05");
  });

  it("accepts a raw Excel serial number", () => {
    expect(normalizeDate(44562)).toBe("2022-01-01");
  });

  it("accepts a JS Date instance (sheetjs cellDates: true)", () => {
    expect(normalizeDate(new Date(Date.UTC(2024, 5, 15)))).toBe("2024-06-15");
  });

  it("rejects an impossible calendar date", () => {
    expect(normalizeDate("31-04-2020")).toBeNull(); // April has 30 days
    expect(normalizeDate("29-02-2021")).toBeNull(); // not a leap year
  });

  it("rejects garbage text", () => {
    expect(normalizeDate("not a date")).toBeNull();
    expect(normalizeDate("")).toBeNull();
  });

  it("rejects null/undefined", () => {
    expect(normalizeDate(null)).toBeNull();
    expect(normalizeDate(undefined)).toBeNull();
  });
});

describe("normalizeStatus", () => {
  it("recognizes a known status case-insensitively", () => {
    expect(normalizeStatus("Closed")).toBe("closed");
    expect(normalizeStatus("  FORWARDED ")).toBe("forwarded");
  });

  it("defaults to open when blank", () => {
    expect(normalizeStatus("")).toBe("open");
    expect(normalizeStatus(null)).toBe("open");
    expect(normalizeStatus(undefined)).toBe("open");
  });

  it("defaults to open when unrecognized", () => {
    expect(normalizeStatus("pending")).toBe("open");
  });
});

describe("resolveByName", () => {
  const list = [
    { id: "1", name: "Labour Section A" },
    { id: "2", name: "Labour Section B" },
  ];

  it("matches case-insensitively and ignores surrounding whitespace", () => {
    expect(resolveByName("  labour section a ", list)).toBe("1");
    expect(resolveByName("LABOUR SECTION B", list)).toBe("2");
  });

  it("returns null when nothing matches, rather than guessing", () => {
    expect(resolveByName("Unknown Section", list)).toBeNull();
  });

  it("returns null for a blank name", () => {
    expect(resolveByName("   ", list)).toBeNull();
  });
});

describe("buildDefaultMapping", () => {
  it("matches common header variants to the right field", () => {
    const headers = [
      "File No.",
      "Act",
      "Received Date",
      "Subject",
      "Memo No",
      "Section",
      "Received From",
      "Status",
      "Applicant Name",
      "Applicant Phone",
      "Applicant Email",
      "Management Name",
      "Management Phone",
      "Management Email",
    ];
    const mapping = buildDefaultMapping(headers);
    expect(mapping.file_number).toBe("File No.");
    expect(mapping.act).toBe("Act");
    expect(mapping.received_date).toBe("Received Date");
    expect(mapping.subject).toBe("Subject");
    expect(mapping.memo_number).toBe("Memo No");
    expect(mapping.section_name).toBe("Section");
    expect(mapping.received_from_name).toBe("Received From");
    expect(mapping.status).toBe("Status");
    expect(mapping.applicant_name).toBe("Applicant Name");
    expect(mapping.applicant_phone).toBe("Applicant Phone");
    expect(mapping.applicant_email).toBe("Applicant Email");
    expect(mapping.management_name).toBe("Management Name");
    expect(mapping.management_phone).toBe("Management Phone");
    expect(mapping.management_email).toBe("Management Email");
  });

  it("leaves a field unmapped (null) when no header matches", () => {
    const mapping = buildDefaultMapping(["Some Random Column"]);
    expect(mapping.file_number).toBeNull();
    expect(mapping.act).toBeNull();
  });

  it("never assigns the same header to two different fields", () => {
    // "Management" alone is only aliased to management_name, not to
    // management_phone/email, so this also guards against over-eager matching.
    const mapping = buildDefaultMapping(["Management"]);
    const usedHeaders = Object.values(mapping).filter((v): v is string => v !== null);
    expect(new Set(usedHeaders).size).toBe(usedHeaders.length);
  });

  it("is case-insensitive and tolerant of punctuation/underscores", () => {
    const mapping = buildDefaultMapping(["file_number", "RECEIVED_FROM"]);
    expect(mapping.file_number).toBe("file_number");
    expect(mapping.received_from_name).toBe("RECEIVED_FROM");
  });
});

describe("extractMappedRow", () => {
  const headers = ["File No.", "Act Name", "Date"];
  const emptyMapping: Record<CaseImportField, string | null> = {
    file_number: "File No.",
    act: "Act Name",
    received_date: "Date",
    subject: null,
    memo_number: null,
    section_name: null,
    received_from_name: null,
    status: null,
    applicant_name: null,
    applicant_phone: null,
    applicant_email: null,
    applicant_address: null,
    management_name: null,
    management_phone: null,
    management_email: null,
    management_address: null,
  };

  it("pulls values by header position and trims strings", () => {
    const row = extractMappedRow(headers, ["  EC/12/2020  ", "EC Act", 44562], emptyMapping, 1);
    expect(row.file_number).toBe("EC/12/2020");
    expect(row.act).toBe("EC Act");
    expect(row.received_date_raw).toBe(44562);
    expect(row.subject).toBe(""); // unmapped field
  });

  it("returns empty string / null for unmapped fields without throwing", () => {
    const row = extractMappedRow(headers, ["A", "B", "C"], emptyMapping, 2);
    expect(row.memo_number).toBe("");
    expect(row.applicant_name).toBe("");
  });
});

describe("validateRows", () => {
  const sections = [{ id: "sec-1", name: "Section A" }];
  const receivedFrom = [{ id: "rf-1", name: "Commissioner" }];

  function row(overrides: Partial<MappedRowInput> = {}, rowNumber = 1): MappedRowInput {
    return {
      rowNumber,
      file_number: "F-1",
      act: "EC",
      received_date_raw: "01-01-2024",
      subject: "",
      memo_number: "",
      section_name: "",
      received_from_name: "",
      status: "",
      applicant_name: "",
      applicant_phone: "",
      applicant_email: "",
      applicant_address: "",
      management_name: "",
      management_phone: "",
      management_email: "",
      management_address: "",
      ...overrides,
    };
  }

  it("marks a fully valid row as valid with no errors", () => {
    const [result] = validateRows([row()], { sections, receivedFrom, existingFileNumbers: new Set() });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.received_date).toBe("2024-01-01");
  });

  it("flags a missing required field without blocking other rows", () => {
    const rows = [
      row({ file_number: "" }, 1),
      row({ file_number: "F-2" }, 2),
    ];
    const results = validateRows(rows, { sections, receivedFrom, existingFileNumbers: new Set() });
    expect(results[0].valid).toBe(false);
    expect(results[0].errors).toContain("File number is required.");
    expect(results[1].valid).toBe(true);
  });

  it("flags an unrecognized date as an error", () => {
    const [result] = validateRows([row({ received_date_raw: "not a date" })], {
      sections,
      receivedFrom,
      existingFileNumbers: new Set(),
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Received date is missing or unrecognized.");
  });

  it("flags every occurrence after the first as a duplicate within the file", () => {
    const rows = [
      row({ file_number: "DUP-1" }, 1),
      row({ file_number: "dup-1" }, 2), // same file number, different case
      row({ file_number: "F-3" }, 3),
    ];
    const results = validateRows(rows, { sections, receivedFrom, existingFileNumbers: new Set() });
    expect(results[0].valid).toBe(true);
    expect(results[1].valid).toBe(false);
    expect(results[1].errors.some((e) => e.includes("Duplicate file number"))).toBe(true);
    expect(results[2].valid).toBe(true);
  });

  it("flags a file number that already exists in the database", () => {
    const [result] = validateRows([row({ file_number: "EXISTS-1" })], {
      sections,
      receivedFrom,
      existingFileNumbers: new Set(["exists-1"]),
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("A case with this file number already exists.");
  });

  it("resolves section/received_from names case-insensitively and doesn't block on a miss", () => {
    const [matched] = validateRows([row({ section_name: "section a", received_from_name: "COMMISSIONER" })], {
      sections,
      receivedFrom,
      existingFileNumbers: new Set(),
    });
    expect(matched.section_id).toBe("sec-1");
    expect(matched.received_from_id).toBe("rf-1");
    expect(matched.valid).toBe(true);

    const [unmatched] = validateRows([row({ section_name: "Unknown Section" })], {
      sections,
      receivedFrom,
      existingFileNumbers: new Set(),
    });
    expect(unmatched.section_id).toBeNull();
    expect(unmatched.section_warning).toMatch(/No section matches/);
    expect(unmatched.valid).toBe(true); // a lookup miss is a warning, not a blocking error
  });

  it("defaults status to open when blank/unrecognized, without erroring", () => {
    const [blank] = validateRows([row({ status: "" })], {
      sections,
      receivedFrom,
      existingFileNumbers: new Set(),
    });
    expect(blank.status).toBe("open");

    const [unrecognized] = validateRows([row({ status: "pending review" })], {
      sections,
      receivedFrom,
      existingFileNumbers: new Set(),
    });
    expect(unrecognized.status).toBe("open");
  });

  it("only builds a party draft when a name is present", () => {
    const [withName] = validateRows([row({ applicant_name: "Ravi Kumar", applicant_phone: "9876543210" })], {
      sections,
      receivedFrom,
      existingFileNumbers: new Set(),
    });
    expect(withName.applicant).toEqual({ name: "Ravi Kumar", phone: "9876543210", email: "", address: "" });

    const [phoneOnly] = validateRows([row({ applicant_phone: "9876543210" })], {
      sections,
      receivedFrom,
      existingFileNumbers: new Set(),
    });
    expect(phoneOnly.applicant).toBeNull();
  });
});
