import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRightToLineIcon,
  FolderKanbanIcon,
  FolderOpenIcon,
  CircleCheckIcon,
  IndianRupeeIcon,
  InboxIcon,
  SendIcon,
  type LucideIcon,
} from "lucide-react";
import { formatRupees } from "@/lib/format-money";
import { AttentionPanel } from "@/components/dashboard/attention-panel";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "cn";
import { formatLong, todayIST } from "@/lib/calendar-dates";
import { availableYears, computeYearStats, parseYear, type YearBucket, type YearCaseRow } from "@/lib/entries/year-stats";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

const STAT_LINKS = [
  { key: "total", label: "Total", status: undefined },
  { key: "open", label: "Open", status: "open" },
  { key: "closed", label: "Closed", status: "closed" },
  { key: "forwarded", label: "Forwarded", status: "forwarded" },
] as const;

// All non-deleted entries, RLS-scoped: admins see everything, staff only their own.
async function loadYearRows(supabase: Awaited<ReturnType<typeof createClient>>): Promise<YearCaseRow[] | null> {
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

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayIST();
  const currentYear = Number(today.slice(0, 4));
  const year = parseYear(Array.isArray(sp.year) ? sp.year[0] : sp.year, currentYear);

  const [rows, { data: sections }] = await Promise.all([
    loadYearRows(supabase),
    supabase.from("sections").select("id, name").order("name"),
  ]);
  const sectionNames = new Map((sections ?? []).map((s) => [s.id, s.name]));
  const years = rows ? availableYears(rows, currentYear) : [currentYear];
  if (!years.includes(year)) years.unshift(year);
  const stats = rows ? computeYearStats(rows, year) : null;

  return (
    <div className="grid gap-6">
      <div className="bg-hero relative overflow-hidden rounded-2xl p-6 text-white shadow-elevation-4 ring-1 ring-white/15 md:p-8">
        <div className="animate-float-slow pointer-events-none absolute -top-12 -right-10 size-52 rounded-full bg-gradient-to-br from-white/30 to-white/0 blur-[2px]" />
        <div className="animate-float-slow pointer-events-none absolute -right-2 -bottom-16 size-40 rounded-full bg-gradient-to-tr from-vivid-pink/50 to-transparent [animation-delay:-4s]" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium tracking-wide text-white/70 uppercase">{formatLong(today)}</p>
            <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight drop-shadow-sm">Dashboard {year}</h1>
            <p className="mt-1 max-w-xl text-sm text-white/75">
              Entry counts by Act and Section for {year}. Entries not closed by the end of {year - 1} are carried
              forward automatically. Click a number to see the matching entries.
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

      <nav aria-label="Year" className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">Year</span>
        {years.map((y) => (
          <Link
            key={y}
            href={y === currentYear ? "/dashboard" : `/dashboard?year=${y}`}
            aria-current={y === year ? "page" : undefined}
            className={cn(
              "inline-flex h-8 items-center rounded-full border px-3.5 text-sm font-medium tabular-nums transition-colors",
              y === year
                ? "border-transparent bg-primary text-primary-foreground shadow-elevation-1"
                : "border-border bg-card hover:border-primary/40 hover:bg-accent/60",
            )}
          >
            {y}
          </Link>
        ))}
      </nav>

      {!stats ? (
        <p role="alert" className="text-sm text-muted-foreground">
          Stats aren&apos;t available yet — check back shortly.
        </p>
      ) : stats.totals.total === 0 ? (
        <Card>
          <EmptyState
            title={`No entries in ${year}`}
            description="Nothing was received in this year and nothing was carried forward into it."
            action={
              <Link href="/cases/new" className={buttonVariants({ size: "sm" })}>
                New Entry
              </Link>
            }
          />
        </Card>
      ) : (
        <DashboardStats year={year} stats={stats} sectionNames={sectionNames} />
      )}
    </div>
  );
}

function DashboardStats({
  year,
  stats,
  sectionNames,
}: {
  year: number;
  stats: ReturnType<typeof computeYearStats>;
  sectionNames: Map<string, string>;
}) {
  const { totals, bySection } = stats;
  const list = (extra: Record<string, string>) =>
    `/cases?${new URLSearchParams({ year: String(year), ...extra }).toString()}`;

  const byAct = new Map<string, { key: string; sectionId: string | null; bucket: YearBucket }[]>();
  for (const [key, bucket] of bySection) {
    const [rawAct, sectionId] = key.split("|");
    const act = rawAct || "Unspecified";
    const list = byAct.get(act) ?? [];
    list.push({ key, sectionId: sectionId || null, bucket });
    byAct.set(act, list);
  }
  const nameOf = (id: string | null) => (id ? (sectionNames.get(id) ?? "Section") : "No section");
  const acts = [...byAct.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [, list] of acts) list.sort((a, b) => nameOf(a.sectionId).localeCompare(nameOf(b.sectionId)));

  return (
    <div className="grid gap-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label={`Brought forward from ${year - 1}`}
          value={totals.broughtForward}
          href={list({ year_scope: "brought_forward" })}
          icon={ArrowRightToLineIcon}
          tone="accent"
        />
        <KpiCard
          label={`Received in ${year}`}
          value={totals.received}
          href={list({ year_scope: "received" })}
          icon={InboxIcon}
          tone="primary"
        />
        <KpiCard label={`Total in ${year}`} value={totals.total} href={list({})} icon={FolderKanbanIcon} tone="primary" />
        <KpiCard label="Open" value={totals.open} href={list({ status: "open" })} icon={FolderOpenIcon} tone="warning" />
        <KpiCard
          label={`Closed in ${year}`}
          value={totals.closed}
          href={list({ status: "closed" })}
          icon={CircleCheckIcon}
          tone="success"
        />
        <KpiCard
          label="Forwarded"
          value={totals.forwarded}
          href={list({ status: "forwarded" })}
          icon={SendIcon}
          tone="accent"
        />
        <div className="sm:col-span-2 lg:col-span-3">
          <KpiCard
            label={`Amount recovered in entries closed in ${year}`}
            value={formatRupees(totals.recovered)}
            href={list({ status: "closed" })}
            icon={IndianRupeeIcon}
            tone="success"
          />
        </div>
      </div>

      {acts.map(([act, sectionRows]) => (
        <div key={act} className="grid gap-3">
          <h2 className="flex items-center gap-2.5 font-heading text-lg font-semibold tracking-tight">
            <span aria-hidden className="h-5 w-1.5 rounded-full bg-gradient-to-b from-primary to-vivid-pink" />
            {act}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sectionRows.map(({ key, sectionId, bucket }) => (
              <SectionCard key={key} name={nameOf(sectionId)} sectionId={sectionId} act={act} year={year} bucket={bucket} />
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
  href,
}: {
  href?: string;
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone: keyof typeof KPI_TONE_CLASSES;
}) {
  const card = (
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
  );
  return href ? (
    <Link href={href} className="lift-3d block rounded-xl">
      {card}
    </Link>
  ) : (
    <div className="lift-3d rounded-xl">{card}</div>
  );
}

const STAT_TONE_CLASSES: Record<string, string> = {
  open: "bg-warning/10 hover:bg-warning/20",
  closed: "bg-success/10 hover:bg-success/20",
  forwarded: "bg-accent hover:bg-accent/70",
};

function SectionCard({
  name,
  sectionId,
  act,
  year,
  bucket,
}: {
  name: string;
  sectionId: string | null;
  act: string;
  year: number;
  bucket: YearBucket;
}) {
  return (
    <div className="lift-3d rounded-xl">
      <Card className="h-full">
        <CardHeader>
          <CardTitle>{name}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {STAT_LINKS.map(({ key, label, status }) => {
              const params = new URLSearchParams();
              if (sectionId) params.set("section_id", sectionId);
              if (status) params.set("status", status);
              params.set("act", act);
              params.set("year", String(year));
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
                  <span className="text-lg font-semibold tabular-nums">{bucket[key]}</span>
                </Link>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Brought forward{" "}
              <span className="font-semibold text-foreground tabular-nums">{bucket.broughtForward}</span>
            </span>
            <span>
              Received <span className="font-semibold text-foreground tabular-nums">{bucket.received}</span>
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between rounded-lg bg-success/10 px-2.5 py-1.5 text-xs">
            <span className="text-muted-foreground">Recovered (closed)</span>
            <span className="font-semibold text-[color-mix(in_oklch,var(--success),black_25%)] tabular-nums dark:text-success">
              {formatRupees(bucket.recovered)}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
