import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { CaseFilters } from "@/components/cases/case-filters";
import { CaseStatusBadge } from "@/components/cases/status-badge";
import { DownloadIcon, PlusIcon } from "lucide-react";
import { formatPhones, parsePhoneJson } from "@/components/cases/party-schema";
import { applyEntryFilters, ENTRY_LIST_SELECT, parseEntryFilters, REGISTER_COLUMNS } from "@/lib/entries/filters";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateIST } from "@/lib/format-date";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Current Entries" };

const PAGE_SIZE = 20;

export default async function CasesPage({ searchParams }: PageProps<"/cases">) {
  const sp = await searchParams;
  const filters = parseEntryFilters(sp);
  const { qRaw, act, sectionId, receivedFromId, status, from, to } = filters;
  const pageParam = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const pageRaw = Number(pageParam);
  const page = Number.isFinite(pageRaw) && pageRaw > 1 ? Math.floor(pageRaw) : 1;

  const supabase = await createClient();

  const start = (page - 1) * PAGE_SIZE;
  const query = applyEntryFilters(supabase.from("cases").select(ENTRY_LIST_SELECT, { count: "exact" }), filters)
    .order("received_date", { ascending: false })
    .order("file_number", { ascending: true })
    .range(start, start + PAGE_SIZE - 1);

  const exportParams = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (key !== "page" && typeof value === "string" && value) exportParams.set(key, value);
  }

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
        <div className="flex flex-wrap gap-2">
          <a
            href={`/cases/export${exportParams.size ? `?${exportParams.toString()}` : ""}`}
            className={buttonVariants({ variant: "outline" })}
            download
          >
            <DownloadIcon data-icon="inline-start" />
            Export to Excel
          </a>
          <Link href="/cases/new" className={buttonVariants({})}>
            <PlusIcon data-icon="inline-start" />
            New Entry
          </Link>
        </div>
      </div>

      {(filters.noHearing || filters.olderThanDays !== undefined) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm">
          <span>
            Showing open entries{" "}
            {filters.noHearing ? "with no hearing scheduled" : `pending for more than ${filters.olderThanDays} days`}.
          </span>
          <Link href="/cases" className="font-medium text-primary hover:underline">
            Show all entries
          </Link>
        </div>
      )}

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
            {count ?? 0} {count === 1 ? "entry" : "entries"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              Could not load entries. Please try again.
            </p>
          ) : !cases || cases.length === 0 ? (
            <EmptyState
              title="No entries found"
              description="No entries match these filters. Try clearing a filter, or create a new entry."
              action={
                <Link href="/cases/new" className={buttonVariants({ size: "sm" })}>
                  New Entry
                </Link>
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    {REGISTER_COLUMNS.map((col, i) => (
                      <TableHead key={col} className={i === 0 ? STICKY_CELL : undefined}>
                        {col}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cases.map((c) => {
                    const applicant = c.parties.find((p) => p.role === "applicant");
                    const management = c.parties.find((p) => p.role === "management");
                    return (
                      <TableRow key={c.id}>
                        <TableCell className={`${STICKY_CELL} font-medium`}>
                          <Link href={`/cases/${c.id}`} className="text-primary hover:underline">
                            {c.file_number}
                          </Link>
                        </TableCell>
                        <TableCell>{c.memo_number || "—"}</TableCell>
                        <TableCell>{applicant?.name || "—"}</TableCell>
                        <TableCell>{applicant ? formatPhones(parsePhoneJson(applicant.phone)) : "—"}</TableCell>
                        <TableCell>{applicant?.email || "—"}</TableCell>
                        <LongCell text={applicant?.address} />
                        <TableCell>{management ? formatPhones(parsePhoneJson(management.phone)) : "—"}</TableCell>
                        <TableCell>{management?.email || "—"}</TableCell>
                        <LongCell text={management?.address} />
                        <TableCell>{c.section_id ? (sectionsById.get(c.section_id) ?? "—") : "—"}</TableCell>
                        <TableCell>
                          {c.received_from_id ? (receivedFromById.get(c.received_from_id) ?? "—") : "—"}
                        </TableCell>
                        <TableCell>{c.next_hearing_date ? formatDateIST(c.next_hearing_date) : "—"}</TableCell>
                        <TableCell>
                          <CaseStatusBadge status={c.status} />
                        </TableCell>
                        <LongCell text={c.subject} wide />
                        <TableCell>{formatDateIST(c.received_date)}</TableCell>
                      </TableRow>
                    );
                  })}
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

// File Number stays pinned while the wide table scrolls sideways.
const STICKY_CELL = "sticky left-0 z-10 bg-card shadow-[1px_0_0_var(--border)]";

function LongCell({ text, wide }: { text: string | null | undefined; wide?: boolean }) {
  if (!text) return <TableCell>—</TableCell>;
  return (
    <TableCell className={wide ? "max-w-md" : "max-w-56"}>
      <span className="block truncate" title={text}>
        {text}
      </span>
    </TableCell>
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
