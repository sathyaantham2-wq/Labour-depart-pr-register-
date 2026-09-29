"use server";

import { createClient } from "@/lib/supabase/server";

export type SearchResult = {
  id: string;
  file_number: string;
  subject: string;
  status: string;
  applicant: string | null;
  management: string | null;
};

const MAX_RESULTS = 8;
const SELECT = "id, file_number, subject, status, parties(role, name)";

type Row = {
  id: string;
  file_number: string;
  subject: string;
  status: string;
  parties: { role: string; name: string }[];
};

function toResult(row: Row): SearchResult {
  return {
    id: row.id,
    file_number: row.file_number,
    subject: row.subject,
    status: row.status,
    applicant: row.parties.find((p) => p.role === "applicant")?.name ?? null,
    management: row.parties.find((p) => p.role === "management")?.name ?? null,
  };
}

// Quick search for the Ctrl+K palette. Runs with the caller's RLS-scoped client, so staff
// only ever find their own entries.
export async function searchEntries(rawQuery: string): Promise<SearchResult[]> {
  // Strip characters that are syntax in PostgREST's .or() filter string.
  const q = rawQuery.replace(/[,()%*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  if (q.length < 2) return [];

  const supabase = await createClient();
  const digits = q.replace(/\D/g, "");

  const [direct, byParty, byPhone] = await Promise.all([
    supabase
      .from("cases")
      .select(SELECT)
      .is("deleted_at", null)
      .or(`file_number.ilike.%${q}%,memo_number.ilike.%${q}%,subject.ilike.%${q}%`)
      .order("received_date", { ascending: false })
      .limit(MAX_RESULTS),
    supabase
      .from("parties")
      .select("case_id")
      .or(`name.ilike.%${q}%,email.ilike.%${q}%,whatsapp_phone.ilike.%${q}%`)
      .limit(MAX_RESULTS * 2),
    // Phone numbers live in a jsonb list, so only an exact full-number match is possible here.
    digits.length >= 6 && digits === q.replace(/[\s+-]/g, "")
      ? supabase.from("parties").select("case_id").contains("phone", [{ phone: q }]).limit(MAX_RESULTS)
      : Promise.resolve({ data: [] as { case_id: string }[] }),
  ]);

  const results = new Map<string, SearchResult>();
  for (const row of (direct.data ?? []) as Row[]) results.set(row.id, toResult(row));

  const extraIds = [...new Set([...(byParty.data ?? []), ...(byPhone.data ?? [])].map((p) => p.case_id))].filter(
    (id) => !results.has(id),
  );
  if (extraIds.length && results.size < MAX_RESULTS) {
    const { data } = await supabase
      .from("cases")
      .select(SELECT)
      .is("deleted_at", null)
      .in("id", extraIds.slice(0, MAX_RESULTS));
    for (const row of (data ?? []) as Row[]) results.set(row.id, toResult(row));
  }

  return [...results.values()].slice(0, MAX_RESULTS);
}
