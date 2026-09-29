import { isCaseStatus, type CaseStatus } from "@/components/cases/constants";
import { addDays, todayIST } from "@/lib/calendar-dates";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type RawParams = Record<string, string | string[] | undefined>;

export type EntryFilters = {
  qRaw?: string;
  q?: string;
  act?: string;
  sectionId?: string;
  receivedFromId?: string;
  status?: CaseStatus;
  from?: string;
  to?: string;
  // "Needs attention" shortcuts from the Dashboard (both imply status = open).
  noHearing?: boolean;
  olderThanDays?: number;
  // Dashboard year view: entries received by 31 Dec of this year that were not closed before 1 Jan
  // (i.e. includes those carried forward from earlier years). With a status, that status is as at
  // the end of the year — see year-stats.ts.
  year?: number;
};

export const PENDING_ALERT_DAYS = 60;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Parses the Current Entries filter query string. Shared by the list page and the Excel
// export so an export always contains exactly the rows the user is looking at.
export function parseEntryFilters(sp: RawParams): EntryFilters {
  const qRaw = first(sp.q)?.trim() || undefined;
  const sectionId = first(sp.section_id);
  const receivedFromId = first(sp.received_from_id);
  const statusRaw = first(sp.status);
  const from = first(sp.from);
  const to = first(sp.to);
  return {
    qRaw,
    // Strip characters that are syntax in PostgREST's .or() filter string.
    q: qRaw ? qRaw.replace(/[,()]/g, " ").replace(/\s+/g, " ").trim() || undefined : undefined,
    act: first(sp.act)?.trim() || undefined,
    sectionId: sectionId && UUID_RE.test(sectionId) ? sectionId : undefined,
    receivedFromId: receivedFromId && UUID_RE.test(receivedFromId) ? receivedFromId : undefined,
    status: isCaseStatus(statusRaw) ? statusRaw : undefined,
    from: from && DATE_RE.test(from) ? from : undefined,
    to: to && DATE_RE.test(to) ? to : undefined,
    noHearing: first(sp.no_hearing) === "1" || undefined,
    olderThanDays: /^\d{1,4}$/.test(first(sp.older_than) ?? "") ? Number(first(sp.older_than)) : undefined,
    year: /^(19|20)\d{2}$/.test(first(sp.year) ?? "") ? Number(first(sp.year)) : undefined,
  };
}

// Minimal structural type for a PostgREST filter builder, so this works for any select shape.
type Filterable<T> = {
  or(filters: string): T;
  ilike(column: string, pattern: string): T;
  eq(column: string, value: string): T;
  gte(column: string, value: string): T;
  lte(column: string, value: string): T;
  lt(column: string, value: string): T;
  is(column: string, value: null): T;
};

export function applyEntryFilters<T extends Filterable<T>>(query: T, f: EntryFilters): T {
  let q = query;
  if (f.q) q = q.or(`file_number.ilike.%${f.q}%,subject.ilike.%${f.q}%,memo_number.ilike.%${f.q}%`);
  if (f.act) q = q.ilike("act", `%${f.act}%`);
  if (f.sectionId) q = q.eq("section_id", f.sectionId);
  if (f.receivedFromId) q = q.eq("received_from_id", f.receivedFromId);
  if (f.year !== undefined) {
    const start = `${f.year}-01-01`;
    const end = `${f.year}-12-31`;
    q = q.lte("received_date", end).or(`closed_at.is.null,closed_at.gte.${start}`);
    if (f.status === "closed") q = q.eq("status", "closed").gte("closed_at", start).lte("closed_at", end);
    else if (f.status === "open") q = q.or(`status.eq.open,closed_at.gt.${end}`);
    else if (f.status === "forwarded") q = q.eq("status", "forwarded");
  } else if (f.status) q = q.eq("status", f.status);
  if (f.from) q = q.gte("next_hearing_date", f.from);
  if (f.to) q = q.lte("next_hearing_date", f.to);
  if (f.noHearing || f.olderThanDays !== undefined) q = q.eq("status", "open");
  if (f.noHearing) q = q.is("next_hearing_date", null);
  if (f.olderThanDays !== undefined) q = q.lt("received_date", addDays(todayIST(), -f.olderThanDays));
  q = q.is("deleted_at", null);
  return q;
}

// Columns, order and wording of the office's own register export.
export const REGISTER_COLUMNS = [
  "File Number",
  "Memo Number",
  "Applicant Name",
  "Applicant Phone",
  "Applicant Email",
  "Applicant Address",
  "Management Phone",
  "Management Email",
  "Management Address",
  "Section",
  "Receive From",
  "Hearing Date",
  "Status",
  "Subject",
  "Submission Date",
] as const;

export const ENTRY_LIST_SELECT =
  "id, file_number, memo_number, subject, received_date, next_hearing_date, status, section_id, received_from_id, parties(role, name, phone, email, address)";
