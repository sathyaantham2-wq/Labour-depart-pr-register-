import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PARTY_ROLE_LABELS, type PartyRole } from "@/components/cases/constants";
import { noticeTypeLabel } from "@/components/notice-templates/constants";
import { formatDateIST } from "@/lib/format-date";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export const metadata: Metadata = { title: "Notice History" };

function NoticeStatusBadge({ status }: { status: string }) {
  const variant =
    status === "sent" ? "default" : status === "partial" ? "secondary" : status === "failed" ? "destructive" : "outline";
  return <Badge variant={variant}>{status}</Badge>;
}

function DeliveryStatusBadge({ status }: { status: string }) {
  const variant =
    status === "sent" || status === "delivered" || status === "read"
      ? "default"
      : status === "failed"
        ? "destructive"
        : "outline";
  return <Badge variant={variant}>{status}</Badge>;
}

export default async function NoticeHistoryPage({ params }: PageProps<"/cases/[id]/notices">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: caseRow } = await supabase.from("cases").select("id, file_number").eq("id", id).maybeSingle();
  if (!caseRow) notFound();

  const [{ data: parties }, { data: notices, error: noticesError }] = await Promise.all([
    supabase.from("parties").select("id, role, name").eq("case_id", id),
    supabase.from("notices").select("*").eq("case_id", id).order("generated_at", { ascending: false }),
  ]);

  const noticeIds = (notices ?? []).map((n) => n.id);
  const { data: deliveries } =
    noticeIds.length > 0
      ? await supabase.from("notice_deliveries").select("*").in("notice_id", noticeIds)
      : { data: [] as Tables<"notice_deliveries">[] };

  const partyName = (partyId: string) => {
    const party = parties?.find((p) => p.id === partyId);
    if (!party) return "Unknown party";
    const roleLabel = PARTY_ROLE_LABELS[party.role as PartyRole] ?? party.role;
    return `${roleLabel} — ${party.name}`;
  };

  const deliveriesForNotice = (noticeId: string) => (deliveries ?? []).filter((d) => d.notice_id === noticeId);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Notice History</h1>
          <p className="text-muted-foreground">File Number: {caseRow.file_number}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/cases/${id}/notice`} className={buttonVariants()}>
            Generate a notice
          </Link>
          <Link href={`/cases/${id}`} className={buttonVariants({ variant: "outline" })}>
            Back to case
          </Link>
        </div>
      </div>

      {noticesError ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load notice history. Please try again.
        </p>
      ) : !notices || notices.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground">No notices generated for this case yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {notices.map((notice) => (
            <Card key={notice.id}>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">{noticeTypeLabel(notice.type)}</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{formatDateIST(notice.generated_at)}</span>
                  <NoticeStatusBadge status={notice.status} />
                </div>
              </CardHeader>
              <CardContent>
                {deliveriesForNotice(notice.id).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No delivery records for this notice.</p>
                ) : (
                  <ul className="grid gap-2 text-sm">
                    {deliveriesForNotice(notice.id).map((d) => (
                      <li key={d.id} className="grid gap-0.5 border-b pb-2 last:border-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{partyName(d.party_id)}</span>
                          <span className="text-muted-foreground">via {d.channel}</span>
                          <DeliveryStatusBadge status={d.status} />
                          {d.sent_at && (
                            <span className="text-muted-foreground">{formatDateIST(d.sent_at)}</span>
                          )}
                        </div>
                        <span className="text-muted-foreground">{d.recipient}</span>
                        {d.error && <span className="text-destructive">{d.error}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
