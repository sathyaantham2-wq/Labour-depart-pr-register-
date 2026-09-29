// Pure helpers over plain "YYYY-MM-DD" calendar dates. Arithmetic is done in UTC so a date
// never shifts by a day regardless of the server's own timezone; "today" is taken in IST.

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string | undefined | null): value is string {
  if (!value || !ISO_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function todayIST(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function toUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function fromUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = toUTC(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUTC(d);
}

// Weeks start on Monday (Indian government working week).
export function startOfWeek(iso: string): string {
  const day = toUTC(iso).getUTCDay(); // 0 = Sunday
  return addDays(iso, -((day + 6) % 7));
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: string): string {
  const d = toUTC(startOfMonth(iso));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return fromUTC(d);
}

export function addMonths(iso: string, months: number): string {
  const d = toUTC(startOfMonth(iso));
  d.setUTCMonth(d.getUTCMonth() + months);
  return fromUTC(d);
}

export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function formatLong(iso: string): string {
  return toUTC(iso).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatShort(iso: string): string {
  return toUTC(iso).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
}

export function formatMonth(iso: string): string {
  return toUTC(iso).toLocaleDateString("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUTC(to).getTime() - toUTC(from).getTime()) / 86_400_000);
}
