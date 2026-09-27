"use client";

import { useEffect, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { addHearing, updateHearing } from "@/app/(app)/cases/[id]/hearings-actions";
import { formatDateIST } from "@/lib/format-date";
import { HEARING_STATUSES, HEARING_STATUS_LABELS, type HearingStatus } from "./constants";
import { HearingStatusBadge } from "./status-badge";

type Hearing = {
  id: string;
  hearing_date: string;
  hearing_time: string | null;
  status: string;
  outcome_notes: string | null;
};

export function HearingsSection({ caseId, hearings }: { caseId: string; hearings: Hearing[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Hearings</CardTitle>
        <AddHearingDialog caseId={caseId} />
      </CardHeader>
      <CardContent>
        {hearings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hearings scheduled yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hearings.map((h) => (
                <TableRow key={h.id}>
                  <TableCell>{formatDateIST(h.hearing_date)}</TableCell>
                  <TableCell>{h.hearing_time ?? "—"}</TableCell>
                  <TableCell>
                    <HearingStatusBadge status={h.status} />
                  </TableCell>
                  <TableCell className="max-w-[240px] truncate">{h.outcome_notes ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <EditHearingDialog caseId={caseId} hearing={h} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function AddHearingDialog({ caseId }: { caseId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ hearing_date: string; hearing_time: string }>({
    defaultValues: { hearing_date: "", hearing_time: "" },
  });

  useEffect(() => {
    if (open) {
      reset({ hearing_date: "", hearing_time: "" });
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setServerError(null);
    }
  }, [open, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await addHearing({
        case_id: caseId,
        hearing_date: values.hearing_date,
        hearing_time: values.hearing_time,
      });
      if (result?.error) {
        setServerError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Hearing added.");
      setOpen(false);
    });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" size="sm" />}>Add hearing</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add hearing</DialogTitle>
          <DialogDescription>Schedule a hearing date for this case.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="hearing_date">Hearing date</Label>
            <Input
              id="hearing_date"
              type="date"
              {...register("hearing_date", { required: "Enter a hearing date." })}
              aria-invalid={!!errors.hearing_date}
            />
            {errors.hearing_date && (
              <p className="text-sm text-destructive">{errors.hearing_date.message}</p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="hearing_time">Time (optional)</Label>
            <Input id="hearing_time" type="time" {...register("hearing_time")} />
          </div>
          {serverError && (
            <p role="alert" className="text-sm text-destructive">
              {serverError}
            </p>
          )}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type HearingFormValues = {
  hearing_date: string;
  hearing_time: string;
  status: HearingStatus;
  outcome_notes: string;
};

function EditHearingDialog({ caseId, hearing }: { caseId: string; hearing: Hearing }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const defaults: HearingFormValues = {
    hearing_date: hearing.hearing_date,
    hearing_time: hearing.hearing_time ?? "",
    status: hearing.status as HearingStatus,
    outcome_notes: hearing.outcome_notes ?? "",
  };

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<HearingFormValues>({ defaultValues: defaults });

  useEffect(() => {
    if (open) {
      reset(defaults);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setServerError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await updateHearing({
        id: hearing.id,
        case_id: caseId,
        hearing_date: values.hearing_date,
        hearing_time: values.hearing_time,
        status: values.status,
        outcome_notes: values.outcome_notes,
      });
      if (result?.error) {
        setServerError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Hearing updated.");
      setOpen(false);
    });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>Update</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Update hearing</DialogTitle>
          <DialogDescription>
            Reschedule, or mark this hearing held / adjourned / cancelled.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor={`edit-date-${hearing.id}`}>Hearing date</Label>
            <Input
              id={`edit-date-${hearing.id}`}
              type="date"
              {...register("hearing_date", { required: "Enter a hearing date." })}
              aria-invalid={!!errors.hearing_date}
            />
            {errors.hearing_date && (
              <p className="text-sm text-destructive">{errors.hearing_date.message}</p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`edit-time-${hearing.id}`}>Time (optional)</Label>
            <Input id={`edit-time-${hearing.id}`} type="time" {...register("hearing_time")} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`edit-status-${hearing.id}`}>Status</Label>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={(value) => field.onChange(value)}>
                  <SelectTrigger id={`edit-status-${hearing.id}`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HEARING_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {HEARING_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`edit-outcome-${hearing.id}`}>Outcome notes (optional)</Label>
            <Textarea id={`edit-outcome-${hearing.id}`} rows={2} {...register("outcome_notes")} />
          </div>
          {serverError && (
            <p role="alert" className="text-sm text-destructive">
              {serverError}
            </p>
          )}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
