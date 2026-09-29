"use client";

import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { CASE_STATUSES, CASE_STATUS_LABELS } from "@/components/cases/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { editCaseSchema, type EditCaseInput } from "../../case-schema";
import { updateCase } from "./actions";

type Lookup = { id: string; name: string };

export function EditCaseForm({
  caseId,
  sections,
  receivedFrom,
  defaultValues,
}: {
  caseId: string;
  sections: Lookup[];
  receivedFrom: Lookup[];
  defaultValues: EditCaseInput;
}) {
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm<EditCaseInput>({ defaultValues });

  const status = watch("status");

  const onSubmit = handleSubmit((values) => {
    const parsed = editCaseSchema.safeParse(values);
    if (!parsed.success) {
      setServerError("Please fix the highlighted fields.");
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string") setError(key as keyof EditCaseInput, { message: issue.message });
      }
      return;
    }

    setServerError(null);
    startTransition(async () => {
      const result = await updateCase(caseId, parsed.data);
      if (result?.error) {
        setServerError(result.error);
        toast.error(result.error);
        if (result.fieldErrors) {
          for (const [field, message] of Object.entries(result.fieldErrors)) {
            setError(field as keyof EditCaseInput, { message });
          }
        }
      }
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit Entry</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="received_from_id">Received From</Label>
            <Controller
              control={control}
              name="received_from_id"
              render={({ field }) => (
                <Select
                  value={field.value || undefined}
                  onValueChange={(value) => field.onChange(value ?? "")}
                >
                  <SelectTrigger id="received_from_id" className="w-full">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {receivedFrom.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="section_id">Section</Label>
            <Controller
              control={control}
              name="section_id"
              render={({ field }) => (
                <Select
                  value={field.value || undefined}
                  onValueChange={(value) => field.onChange(value ?? "")}
                >
                  <SelectTrigger id="section_id" className="w-full">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {sections.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="status">Status</Label>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={(value) => field.onChange(value)}>
                  <SelectTrigger id="status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CASE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {CASE_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {status === "forwarded" && (
            <div className="grid gap-1.5">
              <Label htmlFor="forwarded_to">Forwarded To</Label>
              <Input id="forwarded_to" {...register("forwarded_to")} aria-invalid={!!errors.forwarded_to} />
              {errors.forwarded_to && (
                <p className="text-sm text-destructive">{errors.forwarded_to.message}</p>
              )}
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="amount_recovered">Amount Recovered</Label>
            <Input
              id="amount_recovered"
              type="number"
              step="0.01"
              min="0"
              {...register("amount_recovered")}
              aria-invalid={!!errors.amount_recovered}
            />
            {errors.amount_recovered && (
              <p className="text-sm text-destructive">{errors.amount_recovered.message}</p>
            )}
          </div>

          {serverError && (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {serverError}
            </p>
          )}

          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
