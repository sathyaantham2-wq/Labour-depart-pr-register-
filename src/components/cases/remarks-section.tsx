"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { addRemark, type RemarkState } from "@/app/(app)/cases/[id]/remarks-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateIST } from "@/lib/format-date";

type Remark = { id: string; date: string; text: string; url: string | null };

const initialState: RemarkState = {};

export function RemarksSection({ caseId, remarks }: { caseId: string; remarks: Remark[] }) {
  const [state, formAction, pending] = useActionState(addRemark, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.message) {
      toast.success(state.message);
      formRef.current?.reset();
    }
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Remarks</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form ref={formRef} action={formAction} className="grid gap-2">
          <input type="hidden" name="case_id" value={caseId} />
          <div className="grid gap-1.5">
            <Label htmlFor="remark-text">Add a remark</Label>
            <Textarea id="remark-text" name="text" rows={2} required maxLength={2000} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="remark-url">URL (optional)</Label>
            <Input id="remark-url" name="url" type="url" placeholder="https://…" />
          </div>
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add remark"}
            </Button>
          </div>
        </form>

        <div className="grid gap-3">
          {remarks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No remarks yet.</p>
          ) : (
            remarks.map((r) => (
              <div key={r.id} className="rounded-lg border p-3 text-sm">
                <div className="mb-1 text-xs text-muted-foreground">{formatDateIST(r.date)}</div>
                <p className="whitespace-pre-wrap">{r.text}</p>
                {r.url && (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary underline underline-offset-2"
                  >
                    {r.url}
                  </a>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
