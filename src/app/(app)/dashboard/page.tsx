import type { Metadata } from "next";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FolderKanbanIcon,
  FolderOpenIcon,
  CircleCheckIcon,
  SendIcon,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "cn";
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
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Dashboard</h1>
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
  const totals = { total: 0, open: 0, closed: 0, forwarded: 0 };
  for (const row of rows) {
    const act = row.act ?? "Unspecified";
    const list = byAct.get(act) ?? [];
    list.push(row);
    byAct.set(act, list);
    totals.total += row.total ?? 0;
    totals.open += row.open ?? 0;
    totals.closed += row.closed ?? 0;
    totals.forwarded += row.forwarded ?? 0;
  }

  return (
    <div className="grid gap-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Entries" value={totals.total} icon={FolderKanbanIcon} tone="primary" />
        <KpiCard label="Open" value={totals.open} icon={FolderOpenIcon} tone="warning" />
        <KpiCard label="Closed" value={totals.closed} icon={CircleCheckIcon} tone="success" />
        <KpiCard label="Forwarded" value={totals.forwarded} icon={SendIcon} tone="accent" />
      </div>

      {[...byAct.entries()].map(([act, sectionRows]) => (
        <div key={act} className="grid gap-3">
          <h2 className="font-heading text-lg font-semibold tracking-tight">{act}</h2>
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

const KPI_TONE_CLASSES = {
  primary: "from-primary to-[color-mix(in_oklch,var(--primary),black_15%)] text-primary-foreground",
  warning: "from-warning to-[color-mix(in_oklch,var(--warning),black_10%)] text-warning-foreground",
  success: "from-success to-[color-mix(in_oklch,var(--success),black_10%)] text-success-foreground",
  accent: "from-[oklch(0.65_0.15_195)] to-[color-mix(in_oklch,oklch(0.65_0.15_195),black_15%)] text-white",
} as const;

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: keyof typeof KPI_TONE_CLASSES;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="flex items-center gap-4">
        <div
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-elevation-2",
            KPI_TONE_CLASSES[tone],
          )}
        >
          <Icon className="size-5" />
        </div>
        <div>
          <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

const STAT_TONE_CLASSES: Record<string, string> = {
  open: "bg-warning/10 hover:bg-warning/20",
  closed: "bg-success/10 hover:bg-success/20",
  forwarded: "bg-accent hover:bg-accent/70",
};

function SectionCard({ row, act }: { row: DashboardStatRow; act: string }) {
  return (
    <Card className="transition-all hover:-translate-y-0.5 hover:shadow-elevation-3">
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
                className={cn(
                  "flex flex-col rounded-lg border border-transparent p-2 transition-colors",
                  status ? STAT_TONE_CLASSES[status] : "bg-muted hover:bg-muted/70",
                )}
              >
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="text-lg font-semibold tabular-nums">{value ?? 0}</span>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
