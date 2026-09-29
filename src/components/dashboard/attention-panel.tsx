import Link from "next/link";
import { AlarmClockIcon, CalendarDaysIcon, CalendarX2Icon, HourglassIcon, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { Card, CardContent } from "@/components/ui/card";
import { addDays, todayIST } from "@/lib/calendar-dates";
import { PENDING_ALERT_DAYS } from "@/lib/entries/filters";
import { createClient } from "@/lib/supabase/server";

type Tone = "info" | "alert" | "warn";

// Counts are RLS-scoped: staff see their own entries, admins see the whole office.
export async function AttentionPanel() {
  const supabase = await createClient();
  const today = todayIST();

  const [todayHearings, overdue, noHearing, pending] = await Promise.all([
    supabase
      .from("hearings")
      .select("id, cases!inner(deleted_at)", { count: "exact", head: true })
      .eq("hearing_date", today)
      .eq("status", "scheduled")
      .is("cases.deleted_at", null),
    supabase
      .from("hearings")
      .select("id, cases!inner(deleted_at)", { count: "exact", head: true })
      .lt("hearing_date", today)
      .eq("status", "scheduled")
      .is("cases.deleted_at", null),
    supabase
      .from("cases")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .is("next_hearing_date", null)
      .is("deleted_at", null),
    supabase
      .from("cases")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .lt("received_date", addDays(today, -PENDING_ALERT_DAYS))
      .is("deleted_at", null),
  ]);

  const items: { label: string; hint: string; count: number | null; href: string; icon: LucideIcon; tone: Tone }[] = [
    {
      label: "Hearings today",
      hint: "Open the day's list to record outcomes",
      count: todayHearings.count,
      href: "/hearings",
      icon: CalendarDaysIcon,
      tone: "info",
    },
    {
      label: "Overdue hearings",
      hint: "Past hearings with no outcome recorded",
      count: overdue.count,
      href: "/hearings?view=overdue",
      icon: AlarmClockIcon,
      tone: "alert",
    },
    {
      label: "No hearing scheduled",
      hint: "Open entries without a next date",
      count: noHearing.count,
      href: "/cases?no_hearing=1",
      icon: CalendarX2Icon,
      tone: "warn",
    },
    {
      label: `Pending over ${PENDING_ALERT_DAYS} days`,
      hint: "Open entries received long ago",
      count: pending.count,
      href: `/cases?older_than=${PENDING_ALERT_DAYS}`,
      icon: HourglassIcon,
      tone: "warn",
    },
  ];

  return (
    <section className="grid gap-3" aria-labelledby="attention-heading">
      <h2 id="attention-heading" className="flex items-center gap-2.5 font-heading text-lg font-semibold tracking-tight">
        <span aria-hidden className="h-5 w-1.5 rounded-full bg-gradient-to-b from-warning to-vivid-pink" />
        Needs attention
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => {
          const active = (item.count ?? 0) > 0;
          const Icon = item.icon;
          return (
            <Link key={item.label} href={item.href} className="lift-3d block rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
              <Card
                className={cn(
                  "h-full",
                  active && item.tone === "alert" && "ring-destructive/40",
                  active && item.tone === "warn" && "ring-warning/50",
                )}
              >
                <CardContent className="flex items-start gap-3">
                  <div
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-xl",
                      !active && "bg-muted text-muted-foreground",
                      active && "tile-3d bg-gradient-to-br",
                      active && item.tone === "info" && "from-[oklch(0.7_0.19_290)] to-primary text-white [--tile-glow:oklch(0.52_0.23_277/0.45)]",
                      active && item.tone === "alert" && "from-[oklch(0.7_0.2_25)] to-destructive text-white [--tile-glow:oklch(0.58_0.22_22/0.45)]",
                      active && item.tone === "warn" && "from-[oklch(0.86_0.15_85)] to-[oklch(0.72_0.17_55)] text-warning-foreground [--tile-glow:oklch(0.75_0.17_60/0.5)]",
                    )}
                  >
                    <Icon className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-2xl font-semibold tracking-tight tabular-nums">{item.count ?? "—"}</div>
                    <div className="text-sm font-medium">{item.label}</div>
                    <div className="text-xs text-muted-foreground">{active || item.count === null ? item.hint : "All clear"}</div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
