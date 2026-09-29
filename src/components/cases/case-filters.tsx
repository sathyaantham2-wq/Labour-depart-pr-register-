import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CASE_STATUSES, CASE_STATUS_LABELS } from "./constants";

// Plain native <select>, styled to match the shadcn Input/Select trigger. This
// panel is a browser GET form (no client JS required to filter the case list),
// so a headless combobox component isn't needed here.
const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

type Lookup = { id: string; name: string };

export type CaseFilterValues = {
  q?: string;
  act?: string;
  section_id?: string;
  received_from_id?: string;
  status?: string;
  from?: string;
  to?: string;
};

export function CaseFilters({
  sections,
  receivedFrom,
  values,
}: {
  sections: Lookup[];
  receivedFrom: Lookup[];
  values: CaseFilterValues;
}) {
  const hasFilters = Object.values(values).some(Boolean);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Advanced Filters</CardTitle>
      </CardHeader>
      <CardContent>
        <form method="get" action="/cases" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1.5">
            <Label htmlFor="filter-q">File number / subject</Label>
            <Input id="filter-q" name="q" defaultValue={values.q ?? ""} placeholder="Search…" autoComplete="off" />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="filter-act">Act</Label>
            <Input
              id="filter-act"
              name="act"
              defaultValue={values.act ?? ""}
              placeholder="e.g. EC"
              autoComplete="off"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="filter-section">Section</Label>
            <select
              id="filter-section"
              name="section_id"
              defaultValue={values.section_id ?? ""}
              className={selectClass}
            >
              <option value="">All sections</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="filter-received-from">Receive From</Label>
            <select
              id="filter-received-from"
              name="received_from_id"
              defaultValue={values.received_from_id ?? ""}
              className={selectClass}
            >
              <option value="">All</option>
              {receivedFrom.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="filter-status">Status</Label>
            <select id="filter-status" name="status" defaultValue={values.status ?? ""} className={selectClass}>
              <option value="">All statuses</option>
              {CASE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {CASE_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="filter-from">Next hearing from</Label>
            <Input id="filter-from" name="from" type="date" defaultValue={values.from ?? ""} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="filter-to">Next hearing to</Label>
            <Input id="filter-to" name="to" type="date" defaultValue={values.to ?? ""} />
          </div>

          <div className="flex items-end gap-2">
            <Button type="submit">Apply Filters</Button>
            {hasFilters && (
              <Link href="/cases" className={buttonVariants({ variant: "outline" })}>
                Clear
              </Link>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
