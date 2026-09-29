import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { YearCaseRow } from "@/lib/entries/year-stats";

// All non-deleted entries, RLS-scoped: admins see everything, staff only their own.
export async function loadYearRows(supabase: Awaited<ReturnType<typeof createClient>>): Promise<YearCaseRow[] | null> {
  const rows: YearCaseRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("cases")
      .select("act, section_id, status, received_date, closed_at, amount_recovered")
      .is("deleted_at", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error || !data) return null;
    rows.push(...(data as YearCaseRow[]));
    if (data.length < PAGE) break;
  }
  return rows;
}
