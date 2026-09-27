import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AUDIT_ACTIONS, AUDIT_TABLES } from "./constants";

// Plain native <select>, same pattern as CaseFilters — a browser GET form,
// no client JS required to filter the list.
const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

type Profile = { id: string; full_name: string | null; email: string };

export type AuditLogFilterValues = {
  table?: string;
  action?: string;
  changed_by?: string;
  from?: string;
  to?: string;
};

export function AuditLogFilters({
  profiles,
  values,
}: {
  profiles: Profile[];
  values: AuditLogFilterValues;
}) {
  const hasFilters = Object.values(values).some(Boolean);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Filters</CardTitle>
      </CardHeader>
      <CardContent>
        <form method="get" action="/audit-log" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="grid gap-1.5">
            <Label htmlFor="filter-table">Table</Label>
            <select id="filter-table" name="table" defaultValue={values.table ?? ""} className={selectClass}>
              <option value="">All tables</option>
              {AUDIT_TABLES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="filter-action">Action</Label>
            <select id="filter-action" name="action" defaultValue={values.action ?? ""} className={selectClass}>
              <option value="">All actions</option>
              {AUDIT_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="filter-changed-by">Changed by</Label>
            <select
              id="filter-changed-by"
              name="changed_by"
              defaultValue={values.changed_by ?? ""}
              className={selectClass}
            >
              <option value="">Anyone</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name?.trim() || p.email}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="filter-from">From</Label>
            <Input id="filter-from" name="from" type="date" defaultValue={values.from ?? ""} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="filter-to">To</Label>
            <Input id="filter-to" name="to" type="date" defaultValue={values.to ?? ""} />
          </div>

          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
            <Button type="submit">Apply Filters</Button>
            {hasFilters && (
              <Link href="/audit-log" className={buttonVariants({ variant: "outline" })}>
                Clear
              </Link>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
