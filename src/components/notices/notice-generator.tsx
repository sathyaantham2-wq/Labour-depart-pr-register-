"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { generateNotice, type GenerateNoticeResponse } from "@/app/(app)/cases/[id]/notice/actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HEARING_STATUS_LABELS, PARTY_ROLE_LABELS, type HearingStatus, type PartyRole } from "@/components/cases/constants";
import { NOTICE_TYPE_LABELS, NOTICE_TYPES, type NoticeType } from "@/components/notice-templates/constants";
import { formatDateIST } from "@/lib/format-date";

export type NoticePartySummary = {
  id: string;
  role: string;
  name: string;
  email: string | null;
  whatsapp_phone: string | null;
};

export type NoticeHearingSummary = {
  id: string;
  hearing_date: string;
  hearing_time: string | null;
  status: string;
};

const NO_HEARING = "__none__";

export function NoticeGenerator({
  caseId,
  parties,
  hearings,
}: {
  caseId: string;
  parties: NoticePartySummary[];
  hearings: NoticeHearingSummary[];
}) {
  const [noticeType, setNoticeType] = useState<NoticeType>("hearing");
  const [hearingId, setHearingId] = useState<string>(NO_HEARING);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ status: number; data: GenerateNoticeResponse } | null>(null);

  // Mirrors the (party, channel) planning logic in src/app/api/notices/route.ts so what's
  // shown here lines up exactly with what the API will actually attempt.
  const plan = useMemo(() => {
    const rows: { party: NoticePartySummary; channel: "email" | "whatsapp"; recipient: string | null }[] = [];
    for (const party of parties) {
      rows.push({ party, channel: "email", recipient: party.email?.trim() || null });
      rows.push({ party, channel: "whatsapp", recipient: party.whatsapp_phone?.trim() || null });
    }
    return rows;
  }, [parties]);

  const hasAnyDeliverableChannel = plan.some((r) => r.recipient);

  const onGenerate = () => {
    setResult(null);
    startTransition(async () => {
      const res = await generateNotice({
        case_id: caseId,
        notice_type: noticeType,
        hearing_id: noticeType === "hearing" && hearingId !== NO_HEARING ? hearingId : undefined,
      });
      setResult(res);
      if (res.status === 201) {
        toast.success(res.data.idempotent ? "Notice already existed." : "Notice generated.");
      } else if (res.status === 200 && res.data.idempotent) {
        toast.message("A notice for this request already exists — showing it instead of creating a new one.");
      } else {
        toast.error(res.data.error ?? "Could not generate the notice.");
      }
    });
  };

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>1. Choose notice type</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium" htmlFor="notice-type-select">
              Notice type
            </label>
            <Select
              value={noticeType}
              onValueChange={(v) => {
                setNoticeType(v as NoticeType);
                setHearingId(NO_HEARING);
              }}
            >
              <SelectTrigger id="notice-type-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTICE_TYPES.map((nt) => (
                  <SelectItem key={nt} value={nt}>
                    {NOTICE_TYPE_LABELS[nt]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {noticeType === "hearing" && (
            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="hearing-select">
                Hearing (optional)
              </label>
              {hearings.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hearings recorded for this case yet — the notice will be generated without
                  linking to a specific hearing.
                </p>
              ) : (
                <Select value={hearingId} onValueChange={(v) => setHearingId(v ?? NO_HEARING)}>
                  <SelectTrigger id="hearing-select" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_HEARING}>No specific hearing</SelectItem>
                    {hearings.map((h) => (
                      <SelectItem key={h.id} value={h.id}>
                        {formatDateIST(h.hearing_date)}
                        {h.hearing_time ? ` ${h.hearing_time}` : ""} —{" "}
                        {HEARING_STATUS_LABELS[h.status as HearingStatus] ?? h.status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Who will receive it</CardTitle>
        </CardHeader>
        <CardContent>
          {parties.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No parties on file for this case yet — add an applicant/management party before
              generating a notice.
            </p>
          ) : (
            <div className="grid gap-3">
              {parties.map((party) => (
                <div key={party.id} className="grid gap-1 rounded-md border p-3">
                  <p className="text-sm font-medium">
                    {PARTY_ROLE_LABELS[party.role as PartyRole] ?? party.role} — {party.name}
                  </p>
                  <ChannelRow label="Email" recipient={party.email} noRecipientReason="no email on file" />
                  <ChannelRow
                    label="WhatsApp"
                    recipient={party.whatsapp_phone}
                    noRecipientReason="no WhatsApp number on file"
                  />
                </div>
              ))}
              {!hasAnyDeliverableChannel && (
                <p role="alert" className="text-sm text-destructive">
                  Neither party has an email or WhatsApp number on file — this notice could not
                  be delivered anywhere. Add contact details to a party first.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Generate</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={onGenerate}
              disabled={pending || parties.length === 0 || !hasAnyDeliverableChannel}
            >
              {pending ? "Generating…" : "Generate & Send"}
            </Button>
            <Link href={`/cases/${caseId}/notices`} className={buttonVariants({ variant: "outline" })}>
              Notice History
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            Clicking this more than once for the same case + hearing + notice type is safe — it
            will show you the notice already generated rather than creating a duplicate.
          </p>

          {result && <ResultPanel caseId={caseId} result={result} parties={parties} />}
        </CardContent>
      </Card>
    </div>
  );
}

function ChannelRow({
  label,
  recipient,
  noRecipientReason,
}: {
  label: string;
  recipient: string | null;
  noRecipientReason: string;
}) {
  return (
    <p className="text-sm">
      <span className="text-muted-foreground">{label}: </span>
      {recipient ? (
        <span>
          {recipient} <Badge variant="secondary">will send</Badge>
        </span>
      ) : (
        <span className="text-muted-foreground">
          skipped — {noRecipientReason} <Badge variant="outline">skipped</Badge>
        </span>
      )}
    </p>
  );
}

function ResultPanel({
  result,
  parties,
}: {
  caseId: string;
  result: { status: number; data: GenerateNoticeResponse };
  parties: NoticePartySummary[];
}) {
  const { status, data } = result;
  const partyName = (partyId: string) => parties.find((p) => p.id === partyId)?.name ?? partyId;

  if (status === 201 || (status === 200 && data.idempotent)) {
    return (
      <div className="grid gap-3 rounded-md border p-4">
        <p className="text-sm font-medium">
          {data.idempotent
            ? "A notice for this exact request already existed — showing it below instead of creating a new one."
            : "Notice generated."}
        </p>

        {data.emailResults && data.emailResults.length > 0 && (
          <div>
            <p className="text-sm font-medium">Email</p>
            <ul className="grid gap-1 text-sm">
              {data.emailResults.map((r, i) => (
                <li key={i}>
                  {r.recipient} —{" "}
                  <Badge variant={r.status === "sent" ? "default" : "destructive"}>{r.status}</Badge>
                  {r.error && <span className="text-destructive"> ({r.error})</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.deliveries && data.deliveries.length > 0 && (
          <div>
            <p className="text-sm font-medium">Deliveries</p>
            <ul className="grid gap-1 text-sm">
              {data.deliveries.map((d) => (
                <li key={d.id}>
                  {partyName(d.party_id)} — {d.channel} —{" "}
                  <Badge variant={d.status === "sent" ? "default" : d.status === "failed" ? "destructive" : "outline"}>
                    {d.status}
                  </Badge>
                  {d.error && <span className="text-destructive"> ({d.error})</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.skippedDeliveries && data.skippedDeliveries.length > 0 && (
          <div>
            <p className="text-sm font-medium">Skipped</p>
            <ul className="grid gap-1 text-sm text-muted-foreground">
              {data.skippedDeliveries.map((s, i) => (
                <li key={i}>
                  {s.role} — {s.channel}: {s.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.webhook && (
          <p className="text-sm">
            <span className="text-muted-foreground">WhatsApp webhook: </span>
            {data.webhook}
          </p>
        )}
      </div>
    );
  }

  // 422 "no active template" / "more than one active template" / missing placeholders / no
  // deliverable channel, or any other error status.
  return (
    <div className="grid gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-4">
      <p role="alert" className="text-sm font-medium text-destructive">
        {data.error ?? "Could not generate the notice."}
      </p>
      {data.candidates && data.candidates.length > 0 && (
        <ul className="text-sm text-muted-foreground">
          {data.candidates.map((c) => (
            <li key={c.id}>
              {c.name} ({c.language})
            </li>
          ))}
        </ul>
      )}
      {data.missingPlaceholders && data.missingPlaceholders.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Missing data for: {data.missingPlaceholders.join(", ")}
        </p>
      )}
      {status === 422 && data.error?.includes("No active template") && (
        <Link href="/notice-templates" className="text-sm underline">
          Add one in Notice Templates
        </Link>
      )}
    </div>
  );
}
