// Pure, framework-agnostic helpers for the Data Import screen: normalizing legacy
// dates/serials, guessing a default column mapping from a spreadsheet's header row,
// and validating a batch of mapped rows before they're inserted into `cases`.
//
// Kept dependency-free (no Supabase, no "server-only", no React) so it can be
// imported from the client component (for instant preview validation), from the
// Server Action (for a final pre-insert sanity pass) and from Vitest directly.
import { CASE_STATUSES, type CaseStatus } from "@/components/cases/constants";

export const CASE_IMPORT_FIELDS = [
  "file_number",
  "act",
  "received_date",
  "subject",
  "memo_number",
  "section_name",
  "received_from_name",
  "status",
  "applicant_name",
  "applicant_phone",
  "applicant_email",
  "applicant_address",
  "management_name",
  "management_phone",
  "management_email",
  "management_address",
] as const;

export type CaseImportField = (typeof CASE_IMPORT_FIELDS)[number];

// Act is deliberately NOT required — confirmed against a real 1,736-row office export that
// never tracked it at all; cases.act is nullable for exactly this reason (see
// supabase/migrations/20260928100000_cases_act_optional.sql).
export const REQUIRED_IMPORT_FIELDS: readonly CaseImportField[] = [
  "file_number",
  "received_date",
];

export const IMPORT_FIELD_LABELS: Record<CaseImportField, string> = {
  file_number: "File Number",
  act: "Act",
  received_date: "Received Date",
  subject: "Subject",
  memo_number: "Memo Number",
  section_name: "Section (name)",
  received_from_name: "Received From (name)",
  status: "Status",
  applicant_name: "Applicant Name",
  applicant_phone: "Applicant Phone",
  applicant_email: "Applicant Email",
  applicant_address: "Applicant Address",
  management_name: "Management Name",
  management_phone: "Management Phone",
  management_email: "Management Email",
  management_address: "Management Address",
};

// Header text an admin's legacy spreadsheet is likely to use, per target field.
// Matched case-insensitively against a normalized form of the header (see
// normalizeHeaderText) so "File No.", "file_no", "FILE NO" etc. all match.
const HEADER_ALIASES: Record<CaseImportField, string[]> = {
  file_number: ["file number", "file no", "filenumber", "fileno", "case number", "case no", "file_number"],
  act: ["act"],
  received_date: ["received date", "receipt date", "date received", "dt received", "received_date", "date"],
  subject: ["subject", "particulars", "description"],
  memo_number: ["memo number", "memo no", "memo_number", "memono"],
  section_name: ["section", "section name", "section_name"],
  received_from_name: ["received from", "received_from", "source", "received from name"],
  status: ["status", "case status"],
  applicant_name: ["applicant name", "applicant", "applicant_name", "complainant", "complainant name"],
  applicant_phone: ["applicant phone", "applicant mobile", "applicant contact", "applicant_phone"],
  applicant_email: ["applicant email", "applicant_email"],
  applicant_address: ["applicant address", "applicant_address", "complainant address"],
  management_name: [
    "management name",
    "management",
    "management_name",
    "respondent",
    "respondent name",
    "employer",
    "employer name",
  ],
  management_phone: ["management phone", "employer phone", "management_phone"],
  management_email: ["management email", "employer email", "management_email"],
  management_address: ["management address", "employer address", "management_address"],
};

// Lowercases, collapses punctuation/underscores to single spaces, and trims —
// so "File_No.", "file no", "FILE  NO" all normalize to the same string.
export function normalizeHeaderText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Guesses a mapping from each target field to one of the file's headers, by
// matching normalized header text against the alias list above. Each header is
// used for at most one field (first field to claim it wins, in field-declaration
// order). Fields with no matching header map to null and the admin picks one
// manually.
export function buildDefaultMapping(headers: string[]): Record<CaseImportField, string | null> {
  const normalizedHeaders = headers.map((h) => ({ header: h, normalized: normalizeHeaderText(h) }));
  const claimed = new Set<string>();
  const mapping = {} as Record<CaseImportField, string | null>;

  for (const field of CASE_IMPORT_FIELDS) {
    const aliases = HEADER_ALIASES[field];
    const match = normalizedHeaders.find(
      (h) => !claimed.has(h.header) && aliases.includes(h.normalized),
    );
    if (match) {
      mapping[field] = match.header;
      claimed.add(match.header);
    } else {
      mapping[field] = null;
    }
  }

  return mapping;
}

// Excel's date epoch is 1899-12-30 (it treats 1900 as a leap year by mistake;
// day 60 is the mythical Feb 29 1900 — this offset matches how Excel/Sheets/
// LibreOffice all actually number real-world dates, which is what matters here).
export function excelSerialToISODate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial <= 0) return null;
  const utcMs = Math.round((serial - 25569) * 86400 * 1000);
  const date = new Date(utcMs);
  if (Number.isNaN(date.getTime())) return null;
  return buildISODate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function buildISODate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 1900 || year > 2100) return null;
  // Round-trip through Date.UTC to reject impossible dates like 31-04-2020.
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Normalizes a raw cell value into an ISO `date` string (YYYY-MM-DD), or null if
// it can't be parsed. Accepts:
//   - a JS Date (sheetjs hands these back when cellDates: true is used on cells
//     Excel itself formatted as dates)
//   - an Excel serial number (cells not formatted as dates, or a plain number
//     typed/pasted into the sheet)
//   - common text formats: DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY, and ISO YYYY-MM-DD
export function normalizeDate(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;

  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    return buildISODate(raw.getUTCFullYear(), raw.getUTCMonth() + 1, raw.getUTCDate());
  }

  if (typeof raw === "number") {
    return excelSerialToISODate(raw);
  }

  const str = String(raw).trim();
  if (!str) return null;

  // Already ISO: YYYY-MM-DD (allow single-digit month/day defensively).
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(str);
  if (m) return buildISODate(Number(m[1]), Number(m[2]), Number(m[3]));

  // DD-MM-YYYY / DD/MM/YYYY / DD.MM.YYYY, with 2- or 4-digit year.
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(str);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    return buildISODate(year, Number(m[2]), Number(m[1]));
  }

  // Bare Excel serial typed as text, e.g. "44562".
  if (/^\d{4,6}$/.test(str)) {
    return excelSerialToISODate(Number(str));
  }

  return null;
}

// Case-insensitive, trimmed match of a legacy status label against the app's
// CaseStatus enum. Anything unrecognized (or blank) defaults to "open", per spec.
export function normalizeStatus(raw: string | null | undefined): CaseStatus {
  const norm = (raw ?? "").trim().toLowerCase();
  const found = CASE_STATUSES.find((s) => s === norm);
  return found ?? "open";
}

export type NameLookup = { id: string; name: string };

// Case-insensitive, trimmed lookup of a legacy free-text name (e.g. a section or
// "received from" name) against the office's lookup table. Returns null (no
// match — caller surfaces this as a warning, never a blocking error) rather than
// guessing.
export function resolveByName(name: string, list: readonly NameLookup[]): string | null {
  const norm = name.trim().toLowerCase();
  if (!norm) return null;
  return list.find((l) => l.name.trim().toLowerCase() === norm)?.id ?? null;
}

// A row's values already extracted from the sheet according to the admin's
// column mapping — one field per CaseImportField, all still raw strings except
// received_date which keeps its original cell type so normalizeDate can handle
// Excel serials/Dates as well as text.
export type MappedRowInput = {
  rowNumber: number; // 1-based, counted from the first data row (excludes header)
  file_number: string;
  act: string;
  received_date_raw: unknown;
  subject: string;
  memo_number: string;
  section_name: string;
  received_from_name: string;
  status: string;
  applicant_name: string;
  applicant_phone: string;
  applicant_email: string;
  applicant_address: string;
  management_name: string;
  management_phone: string;
  management_email: string;
  management_address: string;
};

export type PartyDraft = { name: string; phone: string; email: string; address: string };

export type ValidatedRow = {
  rowNumber: number;
  file_number: string;
  act: string;
  received_date: string | null;
  subject: string;
  memo_number: string;
  section_id: string | null;
  section_warning: string | null;
  received_from_id: string | null;
  received_from_warning: string | null;
  status: CaseStatus;
  applicant: PartyDraft | null;
  management: PartyDraft | null;
  errors: string[];
  valid: boolean;
};

function partyDraft(name: string, phone: string, email: string, address: string): PartyDraft | null {
  if (!name.trim()) return null;
  return { name: name.trim(), phone: phone.trim(), email: email.trim(), address: address.trim() };
}

export type ValidateRowsContext = {
  sections: readonly NameLookup[];
  receivedFrom: readonly NameLookup[];
  /** file_number values (any case) that already exist in `cases`. */
  existingFileNumbers: ReadonlySet<string>;
};

// Validates a whole parsed file's worth of mapped rows at once (needed so
// duplicate-file-number-within-the-file detection can see every row). Pure —
// no I/O — so both the client preview and the tests can call it directly; the
// commit Server Action does its own light re-check against the database
// immediately before inserting, to close the race between preview and confirm.
export function validateRows(rows: MappedRowInput[], context: ValidateRowsContext): ValidatedRow[] {
  const firstSeenAt = new Map<string, number>();
  for (const row of rows) {
    const key = row.file_number.trim().toLowerCase();
    if (key && !firstSeenAt.has(key)) firstSeenAt.set(key, row.rowNumber);
  }

  return rows.map((row) => {
    const errors: string[] = [];

    const fileNumber = row.file_number.trim();
    if (!fileNumber) errors.push("File number is required.");

    // Act is optional — many offices' registers (confirmed against a real 1,736-row export)
    // never track it at all; cases.act is nullable for exactly this reason.
    const act = row.act.trim();

    const receivedDate = normalizeDate(row.received_date_raw);
    if (!receivedDate) errors.push("Received date is missing or unrecognized.");

    const key = fileNumber.toLowerCase();
    if (fileNumber && firstSeenAt.get(key) !== row.rowNumber) {
      errors.push(`Duplicate file number in this file (first seen at row ${firstSeenAt.get(key)}).`);
    }
    if (fileNumber && context.existingFileNumbers.has(key)) {
      errors.push("A case with this file number already exists.");
    }

    const sectionId = row.section_name.trim() ? resolveByName(row.section_name, context.sections) : null;
    const sectionWarning =
      row.section_name.trim() && !sectionId ? `No section matches "${row.section_name.trim()}".` : null;

    const receivedFromId = row.received_from_name.trim()
      ? resolveByName(row.received_from_name, context.receivedFrom)
      : null;
    const receivedFromWarning =
      row.received_from_name.trim() && !receivedFromId
        ? `No "Received From" matches "${row.received_from_name.trim()}".`
        : null;

    return {
      rowNumber: row.rowNumber,
      file_number: fileNumber,
      act,
      received_date: receivedDate,
      subject: row.subject.trim(),
      memo_number: row.memo_number.trim(),
      section_id: sectionId,
      section_warning: sectionWarning,
      received_from_id: receivedFromId,
      received_from_warning: receivedFromWarning,
      status: normalizeStatus(row.status),
      applicant: partyDraft(row.applicant_name, row.applicant_phone, row.applicant_email, row.applicant_address),
      management: partyDraft(row.management_name, row.management_phone, row.management_email, row.management_address),
      errors,
      valid: errors.length === 0,
    };
  });
}

// Extracts one row's field values from a raw sheet row (array of cells, in
// header order) according to the admin's chosen mapping. Cells for unmapped
// fields come back as empty strings (or, for received_date, null).
export function extractMappedRow(
  headers: string[],
  cells: unknown[],
  mapping: Record<CaseImportField, string | null>,
  rowNumber: number,
): MappedRowInput {
  const indexOf = (header: string | null) => (header === null ? -1 : headers.indexOf(header));
  const cellAt = (header: string | null): unknown => {
    const idx = indexOf(header);
    return idx === -1 ? null : (cells[idx] ?? null);
  };
  const stringAt = (field: CaseImportField): string => {
    const value = cellAt(mapping[field]);
    return value === null || value === undefined ? "" : String(value).trim();
  };

  return {
    rowNumber,
    file_number: stringAt("file_number"),
    act: stringAt("act"),
    received_date_raw: cellAt(mapping.received_date),
    subject: stringAt("subject"),
    memo_number: stringAt("memo_number"),
    section_name: stringAt("section_name"),
    received_from_name: stringAt("received_from_name"),
    status: stringAt("status"),
    applicant_name: stringAt("applicant_name"),
    applicant_phone: stringAt("applicant_phone"),
    applicant_email: stringAt("applicant_email"),
    applicant_address: stringAt("applicant_address"),
    management_name: stringAt("management_name"),
    management_phone: stringAt("management_phone"),
    management_email: stringAt("management_email"),
    management_address: stringAt("management_address"),
  };
}
