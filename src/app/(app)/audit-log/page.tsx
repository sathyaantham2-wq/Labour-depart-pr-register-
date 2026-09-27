import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { AuditActionBadge } from "@/components/audit-log/action-badge";
import { AuditLogFilters } from "@/components/audit-log/audit-log-filters";
import { isAuditAction, isAuditTable } from "@/components/audit-log/constants";
import { AuditDiffDialog } from "@/components/audit-log/diff-dialog";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateIST } from "@/lib/format-date";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Audit Log" };

const PAGE_SIZE = 30;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// changed_at is a timestamptz; from/to come in as plain IST calendar dates
// from the <input type="date"> filters, so pin them to IST day boundaries
// rather than comparing raw date strings against a timestamp.
function istDayStart(date: string): string {
  return `${date}T00:00:00+05:30`;
}
function istDayEnd(date: string): string {
  return `${date}T23:59:59.999+05:30`;
}

// formatDateIST only gives the date; audit entries need the time of day too.
function formatTimeIST(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export default async function AuditLogPage({ searchParams }: PageProps<"/audit-log">) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    return (
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold">Audit Log</h1>
        <p className="text-muted-foreground">Admins only.</p>
      </div>
    );
  }

  const sp = await searchParams;

  const tableRaw = first(sp.table);
  const table = isAuditTable(tableRaw) ? tableRaw : undefined;
  const actionRaw = first(sp.action);
  const action = isAuditAction(actionRaw) ? actionRaw : undefined;
  const changedBy = first(sp.changed_by);
  const from = first(sp.from);
  const to = first(sp.to);
  const pageRaw = Number(first(sp.page));
  const page = Number.isFinite(pageRaw) && pageRaw > 1 ? Math.floor(pageRaw) : 1;

  const supabase = await createClient();

  let query = supabase
    .from("audit_log")
    .select("id, table_name, record_id, action, changed_by, changed_at, diff", { count: "exact" });

  if (table) query = query.eq("table_name", table);
  if (action) query = query.eq("action", action);
  if (changedBy && UUID_RE.test(changedBy)) query = query.eq("changed_by", changedBy);
  if (from && DATE_RE.test(from)) query = query.gte("changed_at", istDayStart(from));
  if (to && DATE_RE.test(to)) query = query.lte("changed_at", istDayEnd(to));

  const start = (page - 1) * PAGE_SIZE;
  query = query.order("changed_at", { ascending: false }).range(start, start + PAGE_SIZE - 1);

  const [{ data: entries, count, error }, { data: profiles }] = await Promise.all([
    query,
    supabase.from("profiles").select("id, full_name, email").order("full_name"),
  ]);

  const profilesById = new Map((profiles ?? []).map((p) => [p.id, p.full_name?.trim() || p.email]));
  const totalPages = count ? Math.max(1, Math.ceil(count / PAGE_SIZE)) : 1;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Audit Log</h1>
        <p className="text-muted-foreground">Who changed what, and when — admin only.</p>
      </div>

      <AuditLogFilters
        profiles={profiles ?? []}
        values={{ table, action, changed_by: changedBy, from, to }}
      />

      <Card>
        <CardHeader>
          <CardTitle>
            {count ?? 0} entr{count === 1 ? "y" : "ies"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              Could not load the audit log. Please try again.
            </p>
          ) : !entries || entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit entries match these filters.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Table</TableHead>
                      <TableHead>Record</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Changed By</TableHead>
                      <TableHead className="text-right">Diff</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry) => {
                      const changedByLabel = entry.changed_by
                        ? (profilesById.get(entry.changed_by) ?? "Unknown")
                        : "System";
                      const timestampLabel = `${formatDateIST(entry.changed_at)} ${formatTimeIST(entry.changed_at)} IST`;
                      return (
                        <TableRow key={entry.id}>
                          <TableCell className="whitespace-nowrap">{timestampLabel}</TableCell>
                          <TableCell>{entry.table_name}</TableCell>
                          <TableCell className="max-w-[10rem] truncate font-mono text-xs" title={entry.record_id ?? undefined}>
                            {entry.record_id ?? "—"}
                          </TableCell>
                          <TableCell>
                            <AuditActionBadge action={entry.action} />
                          </TableCell>
                          <TableCell>{changedByLabel}</TableCell>
                          <TableCell className="text-right">
                            <AuditDiffDialog
                              tableName={entry.table_name}
                              action={entry.action}
                              timestampLabel={timestampLabel}
                              changedByLabel={changedByLabel}
                              diff={entry.diff}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <PageLink searchParams={sp} page={page - 1} disabled={page <= 1}>
                      Previous
                    </PageLink>
                    <PageLink searchParams={sp} page={page + 1} disabled={page >= totalPages}>
                      Next
                    </PageLink>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PageLink({
  searchParams,
  page,
  disabled,
  children,
}: {
  searchParams: Record<string, string | string[] | undefined>;
  page: number;
  disabled: boolean;
  children: ReactNode;
}) {
  if (disabled) {
    return (
      <span className={`${buttonVariants({ variant: "outline", size: "sm" })} pointer-events-none opacity-50`}>
        {children}
      </span>
    );
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "page") continue;
    if (typeof value === "string" && value) params.set(key, value);
  }
  params.set("page", String(page));

  return (
    <Link href={`/audit-log?${params.toString()}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
      {children}
    </Link>
  );
}
