"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2Icon, CircleAlertIcon, LoaderIcon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatLong } from "@/lib/calendar-dates";

type BulkHearing = { id: string; case_id: string; file_number: string; notice_status: string | null };
type RowState = { state: "waiting" | "sending" | "sent" | "already" | "failed"; message?: string };

// A hearing that already has a sent / partly-sent notice is skipped; failed or pending ones are retried.
function needsNotice(h: BulkHearing) {
  return h.notice_status !== "sent" && h.notice_status !== "partial";
}

export function BulkNotices({ date, hearings }: { date: string; hearings: BulkHearing[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [batch, setBatch] = useState<BulkHearing[]>([]);
  const due = hearings.filter(needsNotice);
  const done = Object.keys(rows).length > 0 && !running;

  async function sendAll() {
    const snapshot = due;
    setBatch(snapshot);
    setRunning(true);
    setRows(Object.fromEntries(snapshot.map((h) => [h.id, { state: "waiting" }])));
    for (const h of snapshot) {
      setRows((r) => ({ ...r, [h.id]: { state: "sending" } }));
      let next: RowState;
      try {
        const res = await fetch("/api/notices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ case_id: h.case_id, hearing_id: h.id, notice_type: "hearing" }),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string; idempotent?: boolean };
        next = res.ok
          ? { state: body.idempotent ? "already" : "sent" }
          : { state: "failed", message: body.error ?? `Request failed (${res.status}).` };
      } catch {
        next = { state: "failed", message: "Network error." };
      }
      setRows((r) => ({ ...r, [h.id]: next }));
    }
    setRunning(false);
    router.refresh();
  }

  const counts = Object.values(rows).reduce<Record<string, number>>((acc, r) => {
    acc[r.state] = (acc[r.state] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <Button
        type="button"
        disabled={due.length === 0}
        onClick={() => {
          setRows({});
          setBatch([]);
          setOpen(true);
        }}
      >
        <SendIcon data-icon="inline-start" />
        {due.length === 0 ? "All notices sent" : `Send notices (${due.length})`}
      </Button>

      <Dialog open={open} onOpenChange={(o) => !running && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send hearing notices</DialogTitle>
            <DialogDescription>
              {done
                ? `Finished: ${counts.sent ?? 0} sent, ${counts.already ?? 0} already sent, ${counts.failed ?? 0} failed.`
                : `Generates a hearing notice for ${due.length} hearing${due.length === 1 ? "" : "s"} on ${formatLong(date)} and emails it to the applicant and management (and WhatsApp, where set up). Parties who already received this hearing's notice are not emailed again.`}
            </DialogDescription>
          </DialogHeader>

          {Object.keys(rows).length > 0 && (
            <ul className="grid max-h-72 gap-1 overflow-y-auto text-sm">
              {batch.map((h) => {
                const row = rows[h.id];
                return (
                  <li key={h.id} className="flex items-start gap-2 rounded-md px-2 py-1 odd:bg-muted/50">
                    {row?.state === "sending" ? (
                      <LoaderIcon className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : row?.state === "failed" ? (
                      <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
                    ) : row?.state === "sent" || row?.state === "already" ? (
                      <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-success" />
                    ) : (
                      <span className="mt-0.5 size-4 shrink-0" />
                    )}
                    <span className="min-w-0">
                      <span className="font-medium">{h.file_number}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        {row?.state === "sent"
                          ? "sent"
                          : row?.state === "already"
                            ? "already sent earlier"
                            : row?.state === "failed"
                              ? `— ${row.message}`
                              : row?.state === "sending"
                                ? "sending…"
                                : "waiting"}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <DialogFooter>
            {done ? (
              <DialogClose render={<Button type="button" />}>Close</DialogClose>
            ) : (
              <>
                <DialogClose render={<Button type="button" variant="outline" disabled={running} />}>Cancel</DialogClose>
                <Button type="button" disabled={running || due.length === 0} onClick={sendAll}>
                  {running ? "Sending…" : `Send ${due.length} notice${due.length === 1 ? "" : "s"}`}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
