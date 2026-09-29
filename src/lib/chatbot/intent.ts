import { addDays, endOfMonth, startOfMonth, startOfWeek } from "@/lib/calendar-dates";

// Rule-based understanding of the assistant's questions. No external AI service: everything is
// matched here and answered from the signed-in user's own (RLS-scoped) data.

export type FaqTopic = "new_entry" | "notice" | "hearing" | "export" | "roles" | "carry_forward" | "search";

export type Intent =
  | { kind: "greeting" }
  | { kind: "faq"; topic: FaqTopic }
  | {
      kind: "count";
      status?: "open" | "closed" | "forwarded";
      sectionName?: string;
      year?: number;
      scope?: "brought_forward" | "received";
      noHearing?: boolean;
      olderThanDays?: number;
    }
  | { kind: "hearings"; from: string; to: string; label: string }
  | { kind: "recovered"; year?: number }
  | { kind: "find"; term: string }
  | { kind: "unknown" };

export const SUGGESTIONS = [
  "How many open entries?",
  "Hearings today",
  "Hearings this week",
  "Entries brought forward this year",
  "Amount recovered this year",
  "Open entries with no hearing",
  "How do I create a new entry?",
];

function findYear(text: string, currentYear: number): number | undefined {
  const m = text.match(/\b(19\d{2}|20\d{2})\b/);
  if (m) return Number(m[1]);
  if (/\bthis year\b/.test(text)) return currentYear;
  if (/\blast year\b|\bprevious year\b/.test(text)) return currentYear - 1;
  return undefined;
}

function findSection(text: string, sectionNames: string[]): string | undefined {
  let best: string | undefined;
  for (const name of sectionNames) {
    const n = name.toLowerCase().trim();
    if (n && text.includes(n) && (!best || n.length > best.length)) best = n;
  }
  return best ? sectionNames.find((s) => s.toLowerCase().trim() === best) : undefined;
}

function hearingRange(text: string, today: string): { from: string; to: string; label: string } {
  if (/\btomorrow\b/.test(text)) {
    const d = addDays(today, 1);
    return { from: d, to: d, label: "tomorrow" };
  }
  if (/\bnext week\b/.test(text)) {
    const s = addDays(startOfWeek(today), 7);
    return { from: s, to: addDays(s, 6), label: "next week" };
  }
  if (/\bthis week\b|\bweek\b/.test(text)) {
    const s = startOfWeek(today);
    return { from: s, to: addDays(s, 6), label: "this week" };
  }
  if (/\bthis month\b|\bmonth\b/.test(text)) {
    return { from: startOfMonth(today), to: endOfMonth(today), label: "this month" };
  }
  if (/\btoday\b|\btoday's\b/.test(text)) return { from: today, to: today, label: "today" };
  return { from: today, to: addDays(today, 14), label: "in the next 14 days" };
}

export function parseIntent(message: string, today: string, sectionNames: string[] = []): Intent {
  const text = message.toLowerCase().replace(/\s+/g, " ").trim();
  const currentYear = Number(today.slice(0, 4));
  if (!text) return { kind: "unknown" };

  if (/^(hi|hello|hey|namaste|help|menu|start)\b[\s!.?]*$/.test(text)) return { kind: "greeting" };

  const original = message.replace(/\s+/g, " ").trim();
  const explicitFind = original.match(/^(?:find|search|lookup|look up|status of|details of|show me|show)\s+(?:the\s+)?(?:file|entry|case)?\s*(?:no\.?|number|#)?\s*(.+)$/i);
  const looksLikeFileNumber = /\d+\s*[/-]\s*\d+/.test(text) && text.split(" ").length <= 6;
  if ((explicitFind && !/hearing|how many|recover/.test(text)) || looksLikeFileNumber) {
    const term = (explicitFind?.[1] ?? original).replace(/^(?:file|entry|case)\s*(?:no\.?|number|#)?\s*/i, "").trim();
    if (term.length >= 2) return { kind: "find", term };
  }

  if (/\bno hearing\b|\bwithout (?:a )?hearing\b|\bnot? (?:yet )?scheduled\b|\bhearing not (?:yet )?(?:set|fixed|scheduled)\b/.test(text)) {
    return { kind: "count", status: "open", noHearing: true, sectionName: findSection(text, sectionNames) };
  }

  if (/\bhearings?\b|\bcalendar\b|\bcause ?list\b/.test(text) && !/\bhow (?:do|can|to)\b/.test(text)) {
    return { kind: "hearings", ...hearingRange(text, today) };
  }

  if (/\brecover(?:ed|y)?\b|\bamount\b|\bmoney\b|\brupees?\b/.test(text)) {
    return { kind: "recovered", year: findYear(text, currentYear) };
  }

  if (/^(?:how (?:do|can|to)|where|what is|what are|what does|who can|can i|can staff|explain)\b/.test(text)) {
    if (/\bcarr(?:y|ied)\b|\bbrought forward\b|\bforward/.test(text)) return { kind: "faq", topic: "carry_forward" };
    if (/\bnotice/.test(text)) return { kind: "faq", topic: "notice" };
    if (/\bhearing/.test(text)) return { kind: "faq", topic: "hearing" };
    if (/\bexport\b|\bexcel\b|\bdownload\b/.test(text)) return { kind: "faq", topic: "export" };
    if (/\brole\b|\bstaff\b|\badmin\b|\bpermission|\baccess\b|\bsee\b/.test(text)) return { kind: "faq", topic: "roles" };
    if (/\bsearch\b|\bfind\b/.test(text)) return { kind: "faq", topic: "search" };
    if (/\b(?:new|create|add|register)\b/.test(text)) return { kind: "faq", topic: "new_entry" };
  }

  const olderThan = text.match(/(?:more than|over|older than|exceed(?:ing)?|above)\s+(\d{1,4})\s+days?/);
  const asksCount =
    /\bhow many\b|\bnumber of\b|\bcount\b|\btotal\b|\bpending\b|\bopen\b|\bclosed\b|\bforwarded\b|\bbrought forward\b|\bcarried forward\b|\breceived\b|\bentries\b|\bcases\b|\bfiles\b|\bold\b/.test(
      text,
    );
  if (asksCount) {
    const status = /\bforwarded\b/.test(text) && !/\b(?:brought|carried) forward/.test(text)
      ? "forwarded"
      : /\bclosed\b|\bdisposed\b|\bresolved\b/.test(text)
        ? "closed"
        : /\bopen\b|\bpending\b/.test(text)
          ? "open"
          : undefined;
    const carried = /\bbrought forward\b|\bcarried forward\b|\bcarry forward\b/.test(text);
    const received = /\breceived\b/.test(text);
    const year = findYear(text, currentYear) ?? (carried || received ? currentYear : undefined);
    return {
      kind: "count",
      status: olderThan ? "open" : status,
      sectionName: findSection(text, sectionNames),
      year,
      scope: carried ? "brought_forward" : received && year !== undefined ? "received" : undefined,
      olderThanDays: olderThan ? Number(olderThan[1]) : /\bold\b/.test(text) ? 60 : undefined,
    };
  }

  if (/\bhelp\b|\bwhat can you\b|\bwhat do you\b/.test(text)) return { kind: "greeting" };

  const words = text.split(" ");
  if (words.length <= 4 && text.length >= 2) return { kind: "find", term: message.trim() };

  return { kind: "unknown" };
}

export const FAQ: Record<FaqTopic, string> = {
  new_entry:
    "To create an entry, click New Entry (top of the Dashboard or Current Entries). Fill the file number, subject, applicant and management details, then save.",
  notice:
    "Open an entry and use its Notice section to generate the notice (DOCX). Notices can then be sent to the applicant and management by Email and WhatsApp.",
  hearing:
    "Open an entry and add a hearing date under Hearings. The next hearing date then shows on the list, the Dashboard and the Hearings calendar.",
  export:
    "On Current Entries, apply any filters and click Export to Excel. The file contains exactly the rows currently filtered.",
  roles:
    "Admins see every entry and manage Sections and lookups. Staff see and edit only entries assigned to them.",
  carry_forward:
    "The Dashboard is year-wise. Entries received earlier and not closed before 1 January of a year are carried forward into that year automatically — no manual step.",
  search:
    "Press Ctrl+K (or /) anywhere to search by file number, memo number, subject, party name, email or phone. On Current Entries, use Advanced Filters.",
};
