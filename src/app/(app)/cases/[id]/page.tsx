import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentsSection } from "@/components/cases/documents-section";
import { HearingsSection } from "@/components/cases/hearings-section";
import { PartyCard } from "@/components/cases/party-card";
import { parsePhoneJson } from "@/components/cases/party-schema";
import { RemarksSection } from "@/components/cases/remarks-section";
import { CaseStatusBadge } from "@/components/cases/status-badge";
import { CASE_STATUS_LABELS, type CaseStatus } from "@/components/cases/constants";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateIST } from "@/lib/format-date";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Current Entry Details" };

export default async function CaseDetailsPage({ params }: PageProps<"/cases/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: caseRow, error: caseError } = await supabase
    .from("cases")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (caseError || !caseRow) notFound();

  const [
    { data: sections },
    { data: receivedFrom },
    { data: parties },
    { data: hearings },
    { data: remarks },
    { data: history },
    { data: documents },
    profile,
  ] = await Promise.all([
      supabase.from("sections").select("id, name"),
      supabase.from("received_from").select("id, name"),
      supabase.from("parties").select("*").eq("case_id", id),
      supabase.from("hearings").select("*").eq("case_id", id).order("hearing_date", { ascending: false }),
      supabase
        .from("remarks")
        .select("*")
        .eq("case_id", id)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("case_status_history").select("*").eq("case_id", id).order("changed_at", { ascending: false }),
      supabase
        .from("case_documents")
        .select("id, file_name, content_type, size_bytes, created_at, uploaded_by")
        .eq("case_id", id)
        .order("created_at", { ascending: false }),
      getCurrentProfile(),
    ]);

  const sectionName = sections?.find((s) => s.id === caseRow.section_id)?.name ?? "—";
  const receivedFromName = receivedFrom?.find((r) => r.id === caseRow.received_from_id)?.name ?? "—";
  const applicantRow = parties?.find((p) => p.role === "applicant") ?? null;
  const managementRow = parties?.find((p) => p.role === "management") ?? null;
  const applicant = applicantRow ? { ...applicantRow, phone: parsePhoneJson(applicantRow.phone) } : null;
  const management = managementRow ? { ...managementRow, phone: parsePhoneJson(managementRow.phone) } : null;
  const statusLabel = CASE_STATUS_LABELS[caseRow.status as CaseStatus] ?? caseRow.status;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{caseRow.file_number}</h1>
          <p className="text-muted-foreground">
            {caseRow.act}
            {caseRow.subject ? ` — ${caseRow.subject}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CaseStatusBadge status={caseRow.status} />
          <Link href={`/cases/${id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Edit Entry
          </Link>
          <Link href={`/cases/${id}/notice`} className={buttonVariants({ size: "sm" })}>
            Print Notice / Download DOCX
          </Link>
          <Link href={`/cases/${id}/notices`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Notice History
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Basic Info</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="File Number" value={caseRow.file_number} />
            <Field label="Act" value={caseRow.act ?? "—"} />
            <Field label="Section" value={sectionName} />
            <Field label="Receive From" value={receivedFromName} />
            <Field label="Submission Date" value={formatDateIST(caseRow.received_date)} />
            <Field label="Memo Number" value={caseRow.memo_number ?? "—"} />
            <Field
              label="Hearing Date"
              value={caseRow.next_hearing_date ? formatDateIST(caseRow.next_hearing_date) : "—"}
            />
            <Field label="Status" value={statusLabel} />
            {caseRow.status === "forwarded" && (
              <Field label="Forwarded To" value={caseRow.forwarded_to ?? "—"} />
            )}
            <Field
              label="Amount Recovered"
              value={caseRow.amount_recovered != null ? String(caseRow.amount_recovered) : "—"}
            />
            {caseRow.closed_at && <Field label="Closed On" value={formatDateIST(caseRow.closed_at)} />}
            <Field label="Subject" value={caseRow.subject || "—"} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status History</CardTitle>
        </CardHeader>
        <CardContent>
          {!history || history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No status changes recorded yet.</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-2 border-b pb-2 last:border-0">
                  <span className="text-muted-foreground">{formatDateIST(h.changed_at)}</span>
                  <span>
                    {h.from_status ? `${h.from_status} → ${h.to_status}` : `Opened as ${h.to_status}`}
                  </span>
                  {h.note && <span className="text-muted-foreground">({h.note})</span>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <PartyCard caseId={id} role="applicant" party={applicant} />
        <PartyCard caseId={id} role="management" party={management} />
      </div>

      <HearingsSection caseId={id} hearings={hearings ?? []} />

      <DocumentsSection
        caseId={id}
        documents={documents ?? []}
        currentUserId={profile?.id ?? ""}
        isAdmin={profile?.role === "admin"}
      />

      <RemarksSection caseId={id} remarks={remarks ?? []} />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium break-words">{value}</dd>
    </div>
  );
}
