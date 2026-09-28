"use server";

import * as XLSX from "xlsx";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";
import type { CaseStatus } from "@/components/cases/constants";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_ROWS = 5000;
const BATCH_SIZE = 50;

async function requireAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    return { ok: false, error: "Admins only." };
  }
  return { ok: true };
}

export type ParseFileResult =
  | { ok: true; headers: string[]; rows: unknown[][] }
  | { ok: false; error: string };

// Parses an uploaded .xlsx/.xls/.csv file server-side (SheetJS) and returns its
// header row plus every data row as an array of raw cell values (numbers/strings/
// Dates as SheetJS produced them — normalization happens in mapping.ts, shared
// with the client preview and the unit tests).
export async function parseImportFile(formData: FormData): Promise<ParseFileResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file to upload." };
  }

  const name = file.name.toLowerCase();
  const isCsv = name.endsWith(".csv");
  const isExcel = name.endsWith(".xlsx") || name.endsWith(".xls");
  if (!isCsv && !isExcel) {
    return { ok: false, error: "Upload a .xlsx or .csv file." };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: "File is too large (max 10 MB)." };
  }

  let workbook: XLSX.WorkBook;
  try {
    if (isCsv) {
      const text = await file.text();
      workbook = XLSX.read(text, { type: "string", raw: true, cellDates: true });
    } else {
      const buffer = await file.arrayBuffer();
      workbook = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: true });
    }
  } catch {
    return { ok: false, error: "Could not read this file. Is it a valid .xlsx or .csv file?" };
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { ok: false, error: "The file has no sheets." };
  const sheet = workbook.Sheets[sheetName];

  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  });
  if (raw.length === 0) return { ok: false, error: "The file is empty." };

  const headerRow = raw[0];
  const headers = headerRow.map((h, i) =>
    h === null || h === undefined || String(h).trim() === "" ? `Column ${i + 1}` : String(h).trim(),
  );

  const dataRows = raw.slice(1).map((row) => headers.map((_, i) => row[i] ?? null));
  if (dataRows.length === 0) return { ok: false, error: "The file has a header row but no data rows." };
  if (dataRows.length > MAX_ROWS) {
    return {
      ok: false,
      error: `This file has ${dataRows.length} data rows; please split it into files of ${MAX_ROWS} rows or fewer.`,
    };
  }

  return { ok: true, headers, rows: dataRows };
}

export type CheckExistingResult =
  | { ok: true; existing: string[] }
  | { ok: false; error: string };

// Given candidate file_number values from the parsed file, returns which of
// them (lowercased) already exist in `cases` — including soft-deleted rows,
// since the DB's unique constraint on (office_code, file_number) doesn't exempt
// them either. Used to flag "already exists" during preview.
export async function checkExistingFileNumbers(fileNumbers: string[]): Promise<CheckExistingResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  const distinct = Array.from(new Set(fileNumbers.map((f) => f.trim()).filter(Boolean)));
  if (distinct.length === 0) return { ok: true, existing: [] };

  const supabase = await createClient();
  const existing: string[] = [];
  // Chunk the .in() filter so very wide imports don't build one giant URL.
  for (let i = 0; i < distinct.length; i += 200) {
    const chunk = distinct.slice(i, i + 200);
    const { data, error } = await supabase.from("cases").select("file_number").in("file_number", chunk);
    if (error) return { ok: false, error: "Could not check existing file numbers. Please try again." };
    for (const row of data ?? []) existing.push(row.file_number.trim().toLowerCase());
  }

  return { ok: true, existing };
}

export type CommitPartyInput = { name: string; phone: string; email: string };

export type CommitRowInput = {
  rowNumber: number;
  file_number: string;
  act: string;
  received_date: string; // ISO YYYY-MM-DD, already normalized by the client
  subject: string;
  memo_number: string;
  section_id: string | null;
  received_from_id: string | null;
  status: CaseStatus;
  applicant: CommitPartyInput | null;
  management: CommitPartyInput | null;
};

export type SkippedRow = { rowNumber: number; file_number: string; reason: string };
export type PartyWarning = { file_number: string; reason: string };

export type CommitImportResult =
  | {
      ok: true;
      importedCount: number;
      skipped: SkippedRow[];
      partyWarnings: PartyWarning[];
    }
  | { ok: false; error: string };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Inserts the previously-validated rows into `cases` (and `parties`, for any
// applicant/management details supplied) in batches, using the signed-in
// admin's own RLS-scoped client — no service role key needed. Re-checks the
// bare essentials (required fields present, date shape, no duplicate within
// this batch) right before inserting, since time may have passed since the
// preview was built (e.g. another admin importing a file at the same time);
// anything that fails is skipped and reported, never aborts the whole import.
export async function commitImport(rows: CommitRowInput[]): Promise<CommitImportResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return admin;

  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "No rows to import." };
  }
  if (rows.length > MAX_ROWS) {
    return { ok: false, error: `Too many rows in one batch (max ${MAX_ROWS}).` };
  }

  const supabase = await createClient();

  const skipped: SkippedRow[] = [];
  const partyWarnings: PartyWarning[] = [];
  let importedCount = 0;

  // Final sanity pass + duplicate-within-this-submission guard (mirrors
  // validateRows in mapping.ts, kept intentionally small — the client already
  // ran the full pure validation for the preview screen).
  const seen = new Set<string>();
  const sane: CommitRowInput[] = [];
  for (const row of rows) {
    const fileNumber = row.file_number.trim();
    const key = fileNumber.toLowerCase();
    if (!fileNumber || !row.act.trim() || !ISO_DATE_RE.test(row.received_date)) {
      skipped.push({ rowNumber: row.rowNumber, file_number: fileNumber, reason: "Missing or invalid required field." });
      continue;
    }
    if (seen.has(key)) {
      skipped.push({ rowNumber: row.rowNumber, file_number: fileNumber, reason: "Duplicate file number in this submission." });
      continue;
    }
    seen.add(key);
    sane.push(row);
  }

  for (let i = 0; i < sane.length; i += BATCH_SIZE) {
    const batch = sane.slice(i, i + BATCH_SIZE);
    const payload = batch.map((row) => ({
      file_number: row.file_number.trim(),
      act: row.act.trim(),
      received_date: row.received_date,
      subject: row.subject.trim(),
      memo_number: row.memo_number.trim() || null,
      section_id: row.section_id,
      received_from_id: row.received_from_id,
      status: row.status,
      // assigned_officer_id / created_by intentionally omitted — the DB
      // defaults both to auth.uid(), i.e. the admin running this import.
    }));

    const { data, error } = await supabase.from("cases").insert(payload).select("id, file_number");

    if (!error && data) {
      importedCount += data.length;
      await insertPartiesForBatch(supabase, batch, data, partyWarnings);
      continue;
    }

    // Batch failed as a whole (most likely a unique-violation on file_number
    // against a row that existed by the time we got here). Fall back to
    // inserting this batch one row at a time so only the offending row(s) are
    // skipped instead of the entire batch.
    for (const row of batch) {
      const { data: single, error: rowError } = await supabase
        .from("cases")
        .insert({
          file_number: row.file_number.trim(),
          act: row.act.trim(),
          received_date: row.received_date,
          subject: row.subject.trim(),
          memo_number: row.memo_number.trim() || null,
          section_id: row.section_id,
          received_from_id: row.received_from_id,
          status: row.status,
        })
        .select("id, file_number")
        .single();

      if (rowError || !single) {
        const reason =
          rowError?.code === "23505"
            ? "A case with this file number already exists."
            : "Could not import this row.";
        skipped.push({ rowNumber: row.rowNumber, file_number: row.file_number, reason });
        continue;
      }

      importedCount += 1;
      await insertPartiesForBatch(supabase, [row], [single], partyWarnings);
    }
  }

  return { ok: true, importedCount, skipped, partyWarnings };
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function insertPartiesForBatch(
  supabase: SupabaseClient,
  rows: CommitRowInput[],
  inserted: { id: string; file_number: string }[],
  partyWarnings: PartyWarning[],
): Promise<void> {
  // Matched by file_number rather than array position — inserted rows aren't
  // guaranteed to come back in request order, and file_number is unique per
  // batch (duplicates within a submission are filtered out before we get here).
  const caseIdByFileNumber = new Map(inserted.map((c) => [c.file_number, c.id]));

  // Imported spreadsheets have one phone column per party (no per-number name column), so each
  // becomes a single unnamed {phone} entry in the jsonb array — matches how the app stores a
  // plain phone number when no name is given anywhere else in the UI.
  const partyRows: {
    case_id: string;
    role: "applicant" | "management";
    name: string;
    phone: { phone: string }[];
    email: string | null;
  }[] = [];
  for (const row of rows) {
    const caseId = caseIdByFileNumber.get(row.file_number.trim());
    if (!caseId) continue;
    if (row.applicant) {
      partyRows.push({
        case_id: caseId,
        role: "applicant",
        name: row.applicant.name,
        phone: row.applicant.phone ? [{ phone: row.applicant.phone }] : [],
        email: row.applicant.email || null,
      });
    }
    if (row.management) {
      partyRows.push({
        case_id: caseId,
        role: "management",
        name: row.management.name,
        phone: row.management.phone ? [{ phone: row.management.phone }] : [],
        email: row.management.email || null,
      });
    }
  }

  if (partyRows.length === 0) return;

  const { error } = await supabase.from("parties").insert(partyRows);
  if (error) {
    // Case rows are already committed at this point — don't fail the import
    // over party details, just surface it so the admin can add them by hand.
    for (const row of rows) {
      if (row.applicant || row.management) {
        partyWarnings.push({
          file_number: row.file_number,
          reason: "Case imported, but applicant/management details could not be saved.",
        });
      }
    }
  }
}
