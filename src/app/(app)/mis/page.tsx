import type { Metadata } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";
import { CsvExportButton } from "./csv-export-button";

export const metadata: Metadata = { title: "Monthly MIS Report" };

// public.monthly_mis's exact shape is intentionally not assumed beyond what
// the brief promises (received/closed/carried_forward per section per
// month) — it's being added by a parallel migration and its precise column
// names weren't known when this page was written, and it might land as a
// private.monthly_mis() function instead of a plain view (in which case
// `.from("monthly_mis")` below errors and we show the fallback message).
// The table renders whatever columns come back instead of hard-coding names.
type MisRow = Record<string, unknown>;

function currentMonth(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

function findMonthColumn(row: MisRow): string | null {
  return Object.keys(row).find((key) => key.toLowerCase().includes("month")) ?? null;
}

export default async function MisPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    return (
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold">Monthly MIS Report</h1>
        <p className="text-muted-foreground">Admins only.</p>
      </div>
    );
  }

  const params = await searchParams;
  const month = params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : currentMonth();

  const supabase = await createClient();
  // monthly_mis may not exist yet (a parallel migration is adding it) —
  // query defensively and fall back to a friendly message instead of
  // crashing. Cast to the untyped client since the view isn't in the
  // generated Database type.
  const { data, error } = await (supabase as unknown as SupabaseClient)
    .from("monthly_mis")
    .select("*");

  const allRows = (data ?? []) as MisRow[];
  const monthColumn = allRows.length > 0 ? findMonthColumn(allRows[0]) : null;
  const rows = monthColumn
    ? allRows.filter((row) => String(row[monthColumn] ?? "").startsWith(month))
    : allRows;
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Monthly MIS Report</h1>
          <p className="text-muted-foreground">
            Received / Closed / Carried Forward, per Act and Section.
          </p>
        </div>
        <form action="/mis" method="get" className="flex items-end gap-2">
          <div className="grid gap-1">
            <Label htmlFor="month">Month</Label>
            <Input id="month" type="month" name="month" defaultValue={month} className="h-9 w-40" />
          </div>
          <Button type="submit" variant="outline">
            View
          </Button>
        </form>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-muted-foreground">
          Stats aren&apos;t available yet — check back shortly.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No MIS data for {month}.</p>
      ) : (
        <div className="grid gap-3">
          <div>
            <CsvExportButton rows={rows} filename={`monthly-mis-${month}.csv`} />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((col) => (
                  <TableHead key={col} className="capitalize">
                    {col.replace(/_/g, " ")}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                // No stable id is assumed on the view — index is fine since
                // this list is static per render (server-fetched, not
                // reordered client-side).
                <TableRow key={index}>
                  {columns.map((col) => (
                    <TableCell key={col}>{String(row[col] ?? "")}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
