import type { Metadata } from "next";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

// Shape of public.dashboard_stats, added by a parallel db-architect migration
// (see CLAUDE.md — RLS scopes rows to the caller: admins see every section,
// staff see only their own cases' counts). Defined locally since it isn't in
// the generated src/types/database.ts yet — regenerating that file mid-way
// through a parallel migration would race with the db-architect agent.
type DashboardStatRow = {
  act: string | null;
  section_id: string | null;
  section_name: string | null;
  total: number | null;
  open: number | null;
  closed: number | null;
  forwarded: number | null;
};

const STAT_LINKS = [
  { key: "total", label: "Total", status: undefined },
  { key: "open", label: "Open", status: "open" },
  { key: "closed", label: "Closed", status: "closed" },
  { key: "forwarded", label: "Forwarded", status: "forwarded" },
] as const;

export default async function DashboardPage() {
  const supabase = await createClient();

  // dashboard_stats may not exist yet (a parallel migration is adding it) —
  // query defensively and fall back to a friendly message instead of
  // crashing. Cast to the untyped client since the view isn't in the
  // generated Database type.
  const { data, error } = await (supabase as unknown as SupabaseClient)
    .from("dashboard_stats")
    .select("*");

  const rows = (data ?? []) as DashboardStatRow[];

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">
          Case counts by Act and Section. Click a number to see the matching cases.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-muted-foreground">
          Stats aren&apos;t available yet — check back shortly.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No case data yet.</p>
      ) : (
        <DashboardStats rows={rows} />
      )}
    </div>
  );
}

function DashboardStats({ rows }: { rows: DashboardStatRow[] }) {
  const byAct = new Map<string, DashboardStatRow[]>();
  for (const row of rows) {
    const act = row.act ?? "Unspecified";
    const list = byAct.get(act) ?? [];
    list.push(row);
    byAct.set(act, list);
  }

  return (
    <div className="grid gap-8">
      {[...byAct.entries()].map(([act, sectionRows]) => (
        <div key={act} className="grid gap-3">
          <h2 className="text-lg font-medium">{act}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sectionRows.map((row, index) => (
              <SectionCard
                key={row.section_id ?? `${act}-${row.section_name ?? index}`}
                row={row}
                act={act}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionCard({ row, act }: { row: DashboardStatRow; act: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{row.section_name ?? "Section"}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {STAT_LINKS.map(({ key, label, status }) => {
            const value = row[key];
            const params = new URLSearchParams();
            if (row.section_id) params.set("section_id", row.section_id);
            if (status) params.set("status", status);
            params.set("act", act);
            return (
              <Link
                key={key}
                href={`/cases?${params.toString()}`}
                className="flex flex-col rounded-md border p-2 transition-colors hover:bg-accent"
              >
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="text-lg font-semibold">{value ?? 0}</span>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
