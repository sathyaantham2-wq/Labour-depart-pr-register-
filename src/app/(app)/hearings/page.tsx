import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "cn";
import { BulkNotices } from "@/components/hearings/bulk-notices";
import { HearingCard, type HearingCardData } from "@/components/hearings/hearing-card";
import { PrintButton } from "@/components/hearings/print-button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  addDays,
  addMonths,
  datesBetween,
  endOfMonth,
  formatLong,
  formatMonth,
  formatShort,
  isIsoDate,
  startOfMonth,
  startOfWeek,
  todayIST,
} from "@/lib/calendar-dates";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Hearings" };

const VIEWS = ["day", "week", "month", "overdue"] as const;
type View = (typeof VIEWS)[number];

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function href(view: View, date: string) {
  return `/hearings?view=${view}&date=${date}`;
}

export default async function HearingsPage({ searchParams }: PageProps<"/hearings">) {
  const sp = await searchParams;
  const today = todayIST();
  const viewRaw = first(sp.view);
  const view: View = (VIEWS as readonly string[]).includes(viewRaw ?? "") ? (viewRaw as View) : "day";
  const dateRaw = first(sp.date);
  const date = isIsoDate(dateRaw) ? dateRaw : today;

  const [from, to] =
    view === "overdue"
      ? ["0001-01-01", addDays(today, -1)]
      : view === "day"
      ? [date, date]
      : view === "week"
        ? [startOfWeek(date), addDays(startOfWeek(date), 6)]
        : [startOfWeek(startOfMonth(date)), addDays(startOfWeek(endOfMonth(date)), 6)];
  const step = (dir: 1 | -1) =>
    view === "day" ? addDays(date, dir) : view === "week" ? addDays(date, 7 * dir) : addMonths(date, dir);

  const supabase = await createClient();
  let hearingQuery = supabase
    .from("hearings")
    .select(
      "id, case_id, hearing_date, hearing_time, status, outcome_notes, cases!inner(file_number, subject, status, deleted_at, parties(role, name))",
    )
    .gte("hearing_date", from)
    .lte("hearing_date", to)
    .is("cases.deleted_at", null);
  if (view === "overdue") hearingQuery = hearingQuery.eq("status", "scheduled").limit(300);
  const { data: hearingRows, error } = await hearingQuery
    .order("hearing_date")
    .order("hearing_time", { nullsFirst: false });

  const hearingIds = (hearingRows ?? []).map((h) => h.id);
  const { data: noticeRows } = hearingIds.length
    ? await supabase
        .from("notices")
        .select("hearing_id, status, generated_at")
        .eq("type", "hearing")
        .in("hearing_id", hearingIds)
        .order("generated_at", { ascending: false })
    : { data: [] };
  const noticeByHearing = new Map<string, string>();
  for (const n of noticeRows ?? []) {
    if (n.hearing_id && !noticeByHearing.has(n.hearing_id)) noticeByHearing.set(n.hearing_id, n.status);
  }

  const hearings: HearingCardData[] = (hearingRows ?? []).map((h) => ({
    id: h.id,
    case_id: h.case_id,
    hearing_date: h.hearing_date,
    hearing_time: h.hearing_time,
    status: h.status,
    outcome_notes: h.outcome_notes,
    file_number: h.cases.file_number,
    subject: h.cases.subject,
    applicant: h.cases.parties.find((p) => p.role === "applicant")?.name ?? null,
    management: h.cases.parties.find((p) => p.role === "management")?.name ?? null,
    notice_status: noticeByHearing.get(h.id) ?? null,
  }));
  const byDate = new Map<string, HearingCardData[]>();
  for (const h of hearings) byDate.set(h.hearing_date, [...(byDate.get(h.hearing_date) ?? []), h]);

  const title =
    view === "overdue"
      ? "Overdue hearings"
      : view === "day"
      ? formatLong(date)
      : view === "week"
        ? `${formatShort(from)} – ${formatShort(to)}`
        : formatMonth(date);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Hearings</h1>
          <p className="text-muted-foreground">
            {view === "overdue"
              ? "Past hearings with no outcome recorded yet — mark each held, adjourned or cancelled."
              : `${date === today && view === "day" ? "Today's hearings. " : ""}Record outcomes as hearings happen.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border bg-card p-0.5 shadow-elevation-1" role="tablist" aria-label="Calendar view">
            {VIEWS.map((v) => (
              <Link
                key={v}
                href={href(v, date)}
                role="tab"
                aria-selected={v === view}
                className={cn(
                  "rounded-md px-3 py-1 text-sm font-medium capitalize transition-colors",
                  v === view ? "bg-primary text-primary-foreground shadow-elevation-1" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {v}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={cn("flex items-center gap-2 print:hidden", view === "overdue" && "invisible")}>
          <Link href={href(view, step(-1))} className={buttonVariants({ variant: "outline", size: "icon" })} aria-label="Previous">
            <ChevronLeftIcon />
          </Link>
          <Link href={href(view, today)} className={buttonVariants({ variant: "outline" })}>
            Today
          </Link>
          <Link href={href(view, step(1))} className={buttonVariants({ variant: "outline", size: "icon" })} aria-label="Next">
            <ChevronRightIcon />
          </Link>
        </div>
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          <span className="hidden print:inline">Hearings — </span>
          {title}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {hearings.length} hearing{hearings.length === 1 ? "" : "s"}
          </span>
        </h2>
        {view === "day" && (
          <div className="flex flex-wrap gap-2 print:hidden">
            <BulkNotices
              date={date}
              hearings={hearings
                .filter((h) => h.status === "scheduled")
                .map((h) => ({ id: h.id, case_id: h.case_id, file_number: h.file_number, notice_status: h.notice_status }))}
            />
            <PrintButton />
          </div>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load hearings. Please try again.
        </p>
      ) : view === "day" || view === "overdue" ? (
        hearings.length === 0 ? (
          <Card>
            {view === "overdue" ? (
              <EmptyState title="Nothing overdue" description="Every past hearing has an outcome recorded." />
            ) : (
              <EmptyState title="No hearings on this day" description="Use the arrows to move between days." />
            )}
          </Card>
        ) : (
          <div className="grid gap-3">
            {hearings.map((h, i) => (
              <HearingCard key={h.id} hearing={h} index={i + 1} showDate={view === "overdue"} />
            ))}
          </div>
        )
      ) : view === "week" ? (
        <div className="grid gap-3 md:grid-cols-7">
          {datesBetween(from, to).map((d) => (
            <DayColumn key={d} date={d} today={today} hearings={byDate.get(d) ?? []} />
          ))}
        </div>
      ) : (
        <MonthGrid from={from} to={to} month={date.slice(0, 7)} today={today} byDate={byDate} />
      )}
    </div>
  );
}

function DayColumn({ date, today, hearings }: { date: string; today: string; hearings: HearingCardData[] }) {
  return (
    <Card size="sm" className={cn("min-h-32", date === today && "ring-2 ring-primary/40")}>
      <CardContent className="grid content-start gap-2">
        <Link href={href("day", date)} className="text-sm font-semibold hover:underline">
          {formatShort(date)}
        </Link>
        {hearings.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
        {hearings.map((h) => (
          <Link
            key={h.id}
            href={`/cases/${h.case_id}`}
            className="grid rounded-md bg-muted px-2 py-1.5 text-xs transition-colors hover:bg-accent"
          >
            <span className="font-medium">
              {h.hearing_time ? `${h.hearing_time.slice(0, 5)} · ` : ""}
              {h.file_number}
            </span>
            <span className="truncate text-muted-foreground">{h.applicant ?? h.subject}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function MonthGrid({
  from,
  to,
  month,
  today,
  byDate,
}: {
  from: string;
  to: string;
  month: string;
  today: string;
  byDate: Map<string, HearingCardData[]>;
}) {
  return (
    <Card>
      <CardContent>
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {datesBetween(from, to).map((d) => {
            const list = byDate.get(d) ?? [];
            const pending = list.filter((h) => h.status === "scheduled").length;
            return (
              <Link
                key={d}
                href={href("day", d)}
                className={cn(
                  "flex aspect-square flex-col rounded-lg border p-1.5 text-left text-xs transition-colors hover:bg-accent sm:aspect-auto sm:min-h-20",
                  !d.startsWith(month) && "opacity-40",
                  d === today && "border-primary ring-1 ring-primary/40",
                )}
              >
                <span className="font-medium">{Number(d.slice(8))}</span>
                {list.length > 0 && (
                  <span className="mt-auto rounded bg-primary/10 px-1 py-0.5 text-center font-medium text-primary">
                    {list.length}
                    <span className="hidden sm:inline"> hearing{list.length === 1 ? "" : "s"}</span>
                    {pending > 0 && pending < list.length && <span className="hidden sm:inline"> · {pending} due</span>}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
