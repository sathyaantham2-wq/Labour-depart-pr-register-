import { isIsoDate } from "@/lib/calendar-dates";

// Year-wise dashboard maths. An entry belongs to year Y when it was received (Submission Date)
// on or before 31 Dec Y and was not already closed before 1 Jan Y — so an entry left open at the
// end of 2025 carries forward into 2026 automatically. Same carry-forward rule as the Monthly MIS.
export type YearCaseRow = {
  act: string | null;
  section_id: string | null;
  status: string;
  received_date: string;
  closed_at: string | null;
  amount_recovered: number | string | null;
};

export type YearBucket = {
  broughtForward: number; // received before the year, still not closed on 1 Jan
  received: number; // received during the year
  total: number; // broughtForward + received
  closed: number; // closed during the year
  forwarded: number; // not closed by year end, status "forwarded"
  open: number; // not closed by year end, any other status
  recovered: number; // amount recovered on entries closed during the year
};

export function emptyBucket(): YearBucket {
  return { broughtForward: 0, received: 0, total: 0, closed: 0, forwarded: 0, open: 0, recovered: 0 };
}

export function sectionKey(act: string | null, sectionId: string | null): string {
  return `${act ?? ""}|${sectionId ?? ""}`;
}

export function yearRange(year: number): { start: string; end: string } {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

function closedDate(row: YearCaseRow): string | null {
  return row.status === "closed" ? (row.closed_at ?? row.received_date) : null;
}

export function computeYearStats(rows: YearCaseRow[], year: number) {
  const { start, end } = yearRange(year);
  const totals = emptyBucket();
  const bySection = new Map<string, YearBucket>();

  for (const row of rows) {
    const closed = closedDate(row);
    if (row.received_date > end) continue;
    if (closed !== null && closed < start) continue;

    const key = sectionKey(row.act, row.section_id);
    let bucket = bySection.get(key);
    if (!bucket) {
      bucket = emptyBucket();
      bySection.set(key, bucket);
    }

    for (const b of [bucket, totals]) {
      b.total += 1;
      if (row.received_date < start) b.broughtForward += 1;
      else b.received += 1;

      if (closed !== null && closed <= end) {
        b.closed += 1;
        b.recovered += Number(row.amount_recovered ?? 0) || 0;
      } else if (row.status === "forwarded") {
        b.forwarded += 1;
      } else {
        b.open += 1;
      }
    }
  }
  return { totals, bySection };
}

// Years worth offering in the selector: from the earliest received year up to the current year.
export function availableYears(rows: Pick<YearCaseRow, "received_date">[], currentYear: number): number[] {
  let earliest = currentYear;
  for (const row of rows) {
    const y = Number(row.received_date.slice(0, 4));
    if (y > 1900 && y < earliest) earliest = y;
  }
  const years: number[] = [];
  for (let y = currentYear; y >= earliest; y--) years.push(y);
  return years;
}

export function parseYear(raw: string | undefined, currentYear: number): number {
  const y = Number(raw);
  return /^\d{4}$/.test(raw ?? "") && isIsoDate(`${y}-01-01`) && y >= 1990 && y <= currentYear + 1 ? y : currentYear;
}
