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
import { AttentionPanel } from "@/components/dashboard/attention-panel";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "cn";
import { formatLong, todayIST } from "@/lib/calendar-dates";
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
      <div className="bg-hero relative overflow-hidden rounded-2xl p-6 text-white shadow-elevation-4 ring-1 ring-white/15 md:p-8">
        <div className="animate-float-slow pointer-events-none absolute -top-12 -right-10 size-52 rounded-full bg-gradient-to-br from-white/30 to-white/0 blur-[2px]" />
        <div className="animate-float-slow pointer-events-none absolute -right-2 -bottom-16 size-40 rounded-full bg-gradient-to-tr from-vivid-pink/50 to-transparent [animation-delay:-4s]" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium tracking-wide text-white/70 uppercase">{formatLong(todayIST())}</p>
            <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight drop-shadow-sm">Dashboard</h1>
            <p className="mt-1 max-w-xl text-sm text-white/75">
              Entry counts by Act and Section. Click a number to see the matching entries.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/cases/new"
              className="inline-flex h-9 items-center rounded-lg bg-white px-3.5 text-sm font-medium text-primary shadow-[0_3px_0_0_oklch(0.8_0.03_285),0_10px_18px_-6px_oklch(0_0_0/0.45)] transition-all hover:bg-white/95 active:translate-y-0.5 active:shadow-[0_1px_0_0_oklch(0.8_0.03_285)]"
            >
              New Entry
            </Link>
            <Link
              href="/hearings"
              className="inline-flex h-9 items-center rounded-lg border border-white/30 bg-white/10 px-3.5 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/20"
            >
              Hearings calendar
            </Link>
          </div>
        </div>
      </div>

      <AttentionPanel />

      {error ? (
        <p role="alert" className="text-sm text-muted-foreground">
          Stats aren&apos;t available yet — check back shortly.
        </p>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            title="No entries yet"
            description="Once entries are added, counts by Act and Section will appear here."
            action={
              <Link href="/cases/new" className={buttonVariants({ size: "sm" })}>
                New Entry
              </Link>
            }
          />
        </Card>
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
          <h2 className="flex items-center gap-2.5 font-heading text-lg font-semibold tracking-tight">
            <span aria-hidden className="h-5 w-1.5 rounded-full bg-gradient-to-b from-primary to-vivid-pink" />
            {act}
          </h2>
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
  primary:
    "from-[oklch(0.7_0.19_290)] to-primary text-primary-foreground [--tile-glow:oklch(0.52_0.23_277/0.45)]",
  warning:
    "from-[oklch(0.86_0.15_85)] to-[oklch(0.72_0.17_55)] text-warning-foreground [--tile-glow:oklch(0.75_0.17_60/0.5)]",
  success:
    "from-[oklch(0.76_0.16_165)] to-success text-success-foreground [--tile-glow:oklch(0.62_0.16_160/0.45)]",
  accent:
    "from-vivid-pink to-vivid-violet text-white [--tile-glow:oklch(0.6_0.23_330/0.45)]",
} as const;

const KPI_BLOB_CLASSES = {
  primary: "from-primary to-vivid-violet",
  warning: "from-warning to-vivid-pink",
  success: "from-success to-vivid-teal",
  accent: "from-vivid-pink to-vivid-violet",
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
    <div className="lift-3d rounded-xl">
      <Card className="relative h-full overflow-hidden">
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute -top-6 -right-6 size-24 rounded-full bg-gradient-to-br opacity-20 blur-xl",
            KPI_BLOB_CLASSES[tone],
          )}
        />
        <CardContent className="relative flex items-center gap-4">
          <div
            className={cn(
              "tile-3d flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br",
              KPI_TONE_CLASSES[tone],
            )}
          >
            <Icon className="size-5.5 drop-shadow-sm" />
          </div>
          <div>
            <div className="text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
            <div className="text-xs font-medium text-muted-foreground">{label}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const STAT_TONE_CLASSES: Record<string, string> = {
  open: "bg-warning/10 hover:bg-warning/20",
  closed: "bg-success/10 hover:bg-success/20",
  forwarded: "bg-accent hover:bg-accent/70",
};

function SectionCard({ row, act }: { row: DashboardStatRow; act: string }) {
  return (
    <div className="lift-3d rounded-xl">
    <Card className="h-full">
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
    </div>
  );
}
