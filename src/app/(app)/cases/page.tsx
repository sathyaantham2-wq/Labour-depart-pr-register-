import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { CaseFilters } from "@/components/cases/case-filters";
import { CaseStatusBadge } from "@/components/cases/status-badge";
import { isCaseStatus } from "@/components/cases/constants";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateIST } from "@/lib/format-date";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Current Entries" };

const PAGE_SIZE = 20;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CasesPage({ searchParams }: PageProps<"/cases">) {
  const sp = await searchParams;

  const qRaw = first(sp.q)?.trim();
  // Strip characters that are syntax in PostgREST's .or() filter string.
  const q = qRaw ? qRaw.replace(/[,()]/g, " ").trim() || undefined : undefined;
  const act = first(sp.act)?.trim() || undefined;
  const sectionId = first(sp.section_id);
  const receivedFromId = first(sp.received_from_id);
  const statusRaw = first(sp.status);
  const status = isCaseStatus(statusRaw) ? statusRaw : undefined;
  const from = first(sp.from);
  const to = first(sp.to);
  const pageRaw = Number(first(sp.page));
  const page = Number.isFinite(pageRaw) && pageRaw > 1 ? Math.floor(pageRaw) : 1;

  const supabase = await createClient();

  let query = supabase
    .from("cases")
    .select(
      "id, file_number, act, received_date, next_hearing_date, status, section_id, received_from_id",
      { count: "exact" },
    );

  if (q) query = query.or(`file_number.ilike.%${q}%,subject.ilike.%${q}%`);
  if (act) query = query.ilike("act", `%${act}%`);
  if (sectionId && UUID_RE.test(sectionId)) query = query.eq("section_id", sectionId);
  if (receivedFromId && UUID_RE.test(receivedFromId)) query = query.eq("received_from_id", receivedFromId);
  if (status) query = query.eq("status", status);
  if (from && DATE_RE.test(from)) query = query.gte("next_hearing_date", from);
  if (to && DATE_RE.test(to)) query = query.lte("next_hearing_date", to);

  const start = (page - 1) * PAGE_SIZE;
  query = query
    .order("received_date", { ascending: false })
    .order("file_number", { ascending: true })
    .range(start, start + PAGE_SIZE - 1);

  const [{ data: cases, count, error }, { data: sections }, { data: receivedFrom }] = await Promise.all([
    query,
    supabase.from("sections").select("id, name").order("name"),
    supabase.from("received_from").select("id, name").order("name"),
  ]);

  const sectionsById = new Map((sections ?? []).map((s) => [s.id, s.name]));
  const receivedFromById = new Map((receivedFrom ?? []).map((r) => [r.id, r.name]));
  const totalPages = count ? Math.max(1, Math.ceil(count / PAGE_SIZE)) : 1;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Current Entries</h1>
          <p className="text-muted-foreground">
            Entries assigned to you. Use Advanced Filters to narrow the list.
          </p>
        </div>
        <Link href="/cases/new" className={buttonVariants({})}>
          New Entry
        </Link>
      </div>

      <CaseFilters
        sections={sections ?? []}
        receivedFrom={receivedFrom ?? []}
        values={{
          q: qRaw,
          act,
          section_id: sectionId,
          received_from_id: receivedFromId,
          status,
          from,
          to,
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>
            {count ?? 0} case{count === 1 ? "" : "s"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              Could not load cases. Please try again.
            </p>
          ) : !cases || cases.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cases match these filters.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File Number</TableHead>
                    <TableHead>Act</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Received From</TableHead>
                    <TableHead>Received Date</TableHead>
                    <TableHead>Next Hearing</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cases.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        <Link href={`/cases/${c.id}`} className="hover:underline">
                          {c.file_number}
                        </Link>
                      </TableCell>
                      <TableCell>{c.act}</TableCell>
                      <TableCell>{c.section_id ? (sectionsById.get(c.section_id) ?? "—") : "—"}</TableCell>
                      <TableCell>
                        {c.received_from_id ? (receivedFromById.get(c.received_from_id) ?? "—") : "—"}
                      </TableCell>
                      <TableCell>{formatDateIST(c.received_date)}</TableCell>
                      <TableCell>
                        {c.next_hearing_date ? formatDateIST(c.next_hearing_date) : "—"}
                      </TableCell>
                      <TableCell>
                        <CaseStatusBadge status={c.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

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
    <Link href={`/cases?${params.toString()}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
      {children}
    </Link>
  );
}
