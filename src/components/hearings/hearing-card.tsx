"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClockIcon, CheckIcon, MailCheckIcon, MailWarningIcon, XIcon } from "lucide-react";
import { recordHearingOutcome } from "@/app/(app)/hearings/actions";
import { HearingStatusBadge } from "@/components/cases/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateIST } from "@/lib/format-date";

export type HearingCardData = {
  id: string;
  case_id: string;
  hearing_date: string;
  hearing_time: string | null;
  status: string;
  outcome_notes: string | null;
  file_number: string;
  subject: string;
  applicant: string | null;
  management: string | null;
  notice_status: string | null;
};

type Outcome = "held" | "adjourned" | "cancelled";

const OUTCOME_COPY: Record<Outcome, { title: string; description: string; confirm: string }> = {
  held: {
    title: "Mark hearing as held",
    description: "Optionally note what happened and schedule the next hearing.",
    confirm: "Mark held",
  },
  adjourned: {
    title: "Adjourn hearing",
    description: "Pick the date the hearing is adjourned to. It will be scheduled automatically.",
    confirm: "Adjourn",
  },
  cancelled: {
    title: "Cancel hearing",
    description: "The hearing will be marked cancelled. Add a reason if useful.",
    confirm: "Cancel hearing",
  },
};

function NoticeBadge({ status }: { status: string | null }) {
  if (status === "sent" || status === "partial") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[color-mix(in_oklch,var(--success),black_20%)]">
        <MailCheckIcon className="size-3.5" /> Notice {status === "partial" ? "partly sent" : "sent"}
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-destructive">
        <MailWarningIcon className="size-3.5" /> Notice failed
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">No notice sent</span>;
}

export function HearingCard({
  hearing,
  index,
  showDate,
}: {
  hearing: HearingCardData;
  index: number;
  showDate?: boolean;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [nextDate, setNextDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const scheduled = hearing.status === "scheduled";

  function open(next: Outcome) {
    setOutcome(next);
    setNextDate("");
    setNotes("");
    setError(null);
  }

  function submit() {
    if (!outcome) return;
    startTransition(async () => {
      const result = await recordHearingOutcome({
        hearing_id: hearing.id,
        case_id: hearing.case_id,
        outcome,
        next_date: nextDate,
        notes,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success(`${hearing.file_number}: hearing ${outcome}${nextDate ? `, next on ${nextDate}` : ""}.`);
      setOutcome(null);
      router.refresh();
    });
  }

  return (
    <Card size="sm" className="break-inside-avoid">
      <CardContent className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
        <div className="flex size-9 items-center justify-center rounded-full bg-muted text-sm font-semibold tabular-nums print:size-auto print:bg-transparent">
          {index}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/cases/${hearing.case_id}`} className="font-semibold text-primary hover:underline">
              {hearing.file_number}
            </Link>
            {showDate && <span className="text-sm text-muted-foreground">{formatDateIST(hearing.hearing_date)}</span>}
            {hearing.hearing_time && <span className="text-sm text-muted-foreground">{hearing.hearing_time.slice(0, 5)}</span>}
            <HearingStatusBadge status={hearing.status} />
            <span className="print:hidden">
              <NoticeBadge status={hearing.notice_status} />
            </span>
          </div>
          <p className="mt-0.5 text-sm">
            <span className="font-medium">{hearing.applicant ?? "Applicant —"}</span>
            <span className="text-muted-foreground"> vs </span>
            <span className="font-medium">{hearing.management ?? "Management —"}</span>
          </p>
          {hearing.subject && <p className="line-clamp-1 text-xs text-muted-foreground print:line-clamp-none">{hearing.subject}</p>}
          {hearing.outcome_notes && <p className="mt-1 text-xs italic text-muted-foreground">Note: {hearing.outcome_notes}</p>}
        </div>

        {scheduled && (
          <div className="grid grid-cols-3 gap-2 sm:flex print:hidden">
            <Button type="button" variant="success" size="lg" onClick={() => open("held")}>
              <CheckIcon data-icon="inline-start" /> Held
            </Button>
            <Button type="button" variant="outline" size="lg" onClick={() => open("adjourned")}>
              <CalendarClockIcon data-icon="inline-start" /> Adjourn
            </Button>
            <Button type="button" variant="destructive" size="lg" onClick={() => open("cancelled")}>
              <XIcon data-icon="inline-start" /> Cancel
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={outcome !== null} onOpenChange={(o) => !o && setOutcome(null)}>
        {outcome && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {OUTCOME_COPY[outcome].title} — {hearing.file_number}
              </DialogTitle>
              <DialogDescription>{OUTCOME_COPY[outcome].description}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              {outcome !== "cancelled" && (
                <div className="grid gap-1.5">
                  <Label htmlFor={`next-${hearing.id}`}>
                    {outcome === "adjourned" ? "Adjourned to" : "Next hearing date (optional)"}
                  </Label>
                  <Input id={`next-${hearing.id}`} type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
                </div>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor={`notes-${hearing.id}`}>Notes (optional)</Label>
                <Textarea id={`notes-${hearing.id}`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Back</DialogClose>
              <Button
                type="button"
                variant={outcome === "cancelled" ? "destructive" : "default"}
                disabled={pending}
                onClick={submit}
              >
                {pending ? "Saving…" : OUTCOME_COPY[outcome].confirm}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </Card>
  );
}
