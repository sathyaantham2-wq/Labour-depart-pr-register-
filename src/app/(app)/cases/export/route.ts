import { NextResponse, type NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { CASE_STATUS_LABELS, type CaseStatus } from "@/components/cases/constants";
import { formatPhones, parsePhoneJson } from "@/components/cases/party-schema";
import { excelDateSerial } from "@/lib/entries/excel";
import { applyEntryFilters, ENTRY_LIST_SELECT, parseEntryFilters, REGISTER_COLUMNS } from "@/lib/entries/filters";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

const CHUNK = 1000; // PostgREST's default max rows per request
const MAX_ROWS = 20_000;

function excelDate(iso: string | null): XLSX.CellObject | null {
  const serial = excelDateSerial(iso);
  return serial === null ? null : { t: "n", v: serial, z: "dd-mm-yyyy" };
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to export entries." }, { status: 401 });

  const filters = parseEntryFilters(Object.fromEntries(request.nextUrl.searchParams));
  const supabase = await createClient();

  const [{ data: sections }, { data: receivedFrom }] = await Promise.all([
    supabase.from("sections").select("id, name"),
    supabase.from("received_from").select("id, name"),
  ]);
  const sectionsById = new Map((sections ?? []).map((s) => [s.id, s.name]));
  const receivedFromById = new Map((receivedFrom ?? []).map((r) => [r.id, r.name]));

  const rows: (string | XLSX.CellObject | null)[][] = [[...REGISTER_COLUMNS]];
  for (let start = 0; start < MAX_ROWS; start += CHUNK) {
    const { data, error } = await applyEntryFilters(supabase.from("cases").select(ENTRY_LIST_SELECT), filters)
      .order("received_date", { ascending: false })
      .order("file_number", { ascending: true })
      .range(start, start + CHUNK - 1);
    if (error) {
      console.error("entries export: query failed", error);
      return NextResponse.json({ error: "Could not export entries. Please try again." }, { status: 500 });
    }

    for (const c of data) {
      const applicant = c.parties.find((p) => p.role === "applicant");
      const management = c.parties.find((p) => p.role === "management");
      const phones = (p: typeof applicant) => (p ? formatPhones(parsePhoneJson(p.phone)).replace("—", "") : "");
      rows.push([
        c.file_number,
        c.memo_number ?? "",
        applicant?.name ?? "",
        phones(applicant),
        applicant?.email ?? "",
        applicant?.address ?? "",
        phones(management),
        management?.email ?? "",
        management?.address ?? "",
        c.section_id ? (sectionsById.get(c.section_id) ?? "") : "",
        c.received_from_id ? (receivedFromById.get(c.received_from_id) ?? "") : "",
        excelDate(c.next_hearing_date),
        CASE_STATUS_LABELS[c.status as CaseStatus] ?? c.status,
        c.subject ?? "",
        excelDate(c.received_date),
      ]);
    }
    if (data.length < CHUNK) break;
  }

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = REGISTER_COLUMNS.map((col) => ({
    wch: col === "Subject" ? 60 : col.endsWith("Address") ? 40 : col.endsWith("Date") ? 12 : 20,
  }));
  sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: REGISTER_COLUMNS.length - 1 } }) };
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Current Entries");
  const buffer: Buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" });

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="current-entries-${today}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
