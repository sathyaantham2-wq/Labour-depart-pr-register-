"use server";

import { searchEntries } from "@/app/(app)/search-actions";
import { formatDateIST } from "@/lib/format-date";
import { formatRupees } from "@/lib/format-money";
import { todayIST } from "@/lib/calendar-dates";
import { FAQ, parseIntent, SUGGESTIONS } from "@/lib/chatbot/intent";
import { applyEntryFilters, type EntryFilters } from "@/lib/entries/filters";
import { loadYearRows } from "@/lib/entries/year-rows";
import { computeYearStats } from "@/lib/entries/year-stats";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export type ChatLink = { label: string; href: string; detail?: string };
export type ChatReply = { text: string; links?: ChatLink[]; suggestions?: string[] };

const MAX_MESSAGE = 300;
const LIST_LIMIT = 8;

function listHref(f: EntryFilters & { sectionId?: string }): string {
  const p = new URLSearchParams();
  if (f.status) p.set("status", f.status);
  if (f.sectionId) p.set("section_id", f.sectionId);
  if (f.year !== undefined) p.set("year", String(f.year));
  if (f.yearScope) p.set("year_scope", f.yearScope);
  if (f.noHearing) p.set("no_hearing", "1");
  if (f.olderThanDays !== undefined) p.set("older_than", String(f.olderThanDays));
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  return `/cases${p.size ? `?${p.toString()}` : ""}`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// Answers a question from the signed-in user's own entries. RLS applies, so staff only ever
// get answers about entries assigned to them. Understanding is rule-based (see chatbot/intent.ts);
// nothing is sent to an external AI service.
export async function askAssistant(rawMessage: string): Promise<ChatReply> {
  const user = await getCurrentUser();
  if (!user) return { text: "Please sign in to use the assistant." };

  const message = rawMessage.slice(0, MAX_MESSAGE);
  const supabase = await createClient();
  const today = todayIST();

  const { data: sections } = await supabase.from("sections").select("id, name");
  const sectionByName = new Map((sections ?? []).map((s) => [s.name, s.id]));
  const intent = parseIntent(message, today, [...sectionByName.keys()]);

  try {
    switch (intent.kind) {
      case "greeting":
        return {
          text: "Hi! I can answer questions about the entries you can see — counts, hearings, amounts recovered — find a file, or explain how to use the app.",
          suggestions: SUGGESTIONS,
        };

      case "faq":
        return { text: FAQ[intent.topic], suggestions: SUGGESTIONS.slice(0, 3) };

      case "count": {
        const sectionId = intent.sectionName ? sectionByName.get(intent.sectionName) : undefined;
        const filters: EntryFilters = {
          status: intent.status,
          sectionId,
          year: intent.year,
          yearScope: intent.scope,
          noHearing: intent.noHearing || undefined,
          olderThanDays: intent.olderThanDays,
        };
        const { count, error } = await applyEntryFilters(
          supabase.from("cases").select("id", { count: "exact", head: true }),
          filters,
        );
        if (error) throw error;
        const n = count ?? 0;

        const parts: string[] = [];
        if (intent.scope === "brought_forward") parts.push(`brought forward into ${intent.year}`);
        else if (intent.scope === "received") parts.push(`received in ${intent.year}`);
        else if (intent.year !== undefined) parts.push(`in the ${intent.year} view`);
        if (intent.status) parts.push(`with status ${intent.status}`);
        if (intent.noHearing) parts.push("with no hearing scheduled");
        if (intent.olderThanDays !== undefined) parts.push(`pending more than ${intent.olderThanDays} days`);
        if (intent.sectionName) parts.push(`in ${intent.sectionName}`);
        const what = parts.length ? ` ${parts.join(", ")}` : "";
        return {
          text: `${plural(n, "entry", "entries")}${what}.`,
          links: n > 0 ? [{ label: "View these entries", href: listHref(filters) }] : undefined,
        };
      }

      case "hearings": {
        const filters: EntryFilters = { status: "open", from: intent.from, to: intent.to };
        const { data, count, error } = await applyEntryFilters(
          supabase
            .from("cases")
            .select("id, file_number, subject, next_hearing_date, parties(role, name)", { count: "exact" }),
          filters,
        )
          .order("next_hearing_date", { ascending: true })
          .order("file_number", { ascending: true })
          .limit(LIST_LIMIT);
        if (error) throw error;
        const n = count ?? 0;
        if (n === 0) return { text: `No open entries have a hearing ${intent.label}.` };
        return {
          text: `${plural(n, "hearing", "hearings")} ${intent.label}${n > LIST_LIMIT ? ` (showing the first ${LIST_LIMIT})` : ""}:`,
          links: [
            ...data.map((c) => ({
              label: c.file_number,
              href: `/cases/${c.id}`,
              detail: `${c.next_hearing_date ? formatDateIST(c.next_hearing_date) : ""} · ${c.parties.find((p) => p.role === "applicant")?.name ?? c.subject}`,
            })),
            ...(n > LIST_LIMIT ? [{ label: "View all", href: listHref(filters) }] : []),
          ],
        };
      }

      case "recovered": {
        const rows = await loadYearRows(supabase);
        if (!rows) throw new Error("load failed");
        const total =
          intent.year !== undefined
            ? computeYearStats(rows, intent.year).totals.recovered
            : rows.reduce((sum, r) => sum + (r.status === "closed" ? Number(r.amount_recovered ?? 0) || 0 : 0), 0);
        return {
          text: `Amount recovered in closed entries${intent.year !== undefined ? ` (closed in ${intent.year})` : ""}: ${formatRupees(total)}.`,
          links: [{ label: "Open the Dashboard", href: intent.year !== undefined ? `/dashboard?year=${intent.year}` : "/dashboard" }],
        };
      }

      case "find": {
        const results = await searchEntries(intent.term);
        if (results.length === 0) {
          return {
            text: `I couldn't find an entry matching “${intent.term}”. Try a file number, party name or phone number.`,
            suggestions: SUGGESTIONS.slice(0, 3),
          };
        }
        return {
          text: `${plural(results.length, "entry", "entries")} matching “${intent.term}”:`,
          links: results.map((r) => ({
            label: r.file_number,
            href: `/cases/${r.id}`,
            detail: `${r.status} · ${r.applicant ?? r.subject}`,
          })),
        };
      }

      default:
        return { text: "Sorry, I didn't understand that. Try one of these:", suggestions: SUGGESTIONS };
    }
  } catch (error) {
    console.error("assistant: failed to answer", error);
    return { text: "Sorry, I couldn't fetch that right now. Please try again." };
  }
}
