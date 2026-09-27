"use client";

import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createCaseSchema, type CreateCaseInput } from "../case-schema";
import { createCase } from "./actions";

type Lookup = { id: string; name: string };

const emptyValues: CreateCaseInput = {
  file_number: "",
  act: "",
  received_date: "",
  memo_number: "",
  subject: "",
  received_from_id: "",
  section_id: "",
};

export function CaseForm({ sections, receivedFrom }: { sections: Lookup[]; receivedFrom: Lookup[] }) {
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<CreateCaseInput>({ defaultValues: emptyValues });

  const onSubmit = handleSubmit((values) => {
    const parsed = createCaseSchema.safeParse(values);
    if (!parsed.success) {
      setServerError("Please fix the highlighted fields.");
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string") setError(key as keyof CreateCaseInput, { message: issue.message });
      }
      return;
    }

    setServerError(null);
    startTransition(async () => {
      const result = await createCase(parsed.data);
      if (result?.error) {
        setServerError(result.error);
        toast.error(result.error);
        if (result.fieldErrors) {
          for (const [field, message] of Object.entries(result.fieldErrors)) {
            setError(field as keyof CreateCaseInput, { message });
          }
        }
      }
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Case</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="file_number">File Number</Label>
            <Input id="file_number" {...register("file_number")} aria-invalid={!!errors.file_number} />
            {errors.file_number && (
              <p className="text-sm text-destructive">{errors.file_number.message}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="act">Act</Label>
            <Input id="act" {...register("act")} placeholder="e.g. EC, ID, S&E" aria-invalid={!!errors.act} />
            {errors.act && <p className="text-sm text-destructive">{errors.act.message}</p>}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="received_date">Received Date</Label>
            <Input
              id="received_date"
              type="date"
              {...register("received_date")}
              aria-invalid={!!errors.received_date}
            />
            {errors.received_date && (
              <p className="text-sm text-destructive">{errors.received_date.message}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="memo_number">Memo Number</Label>
            <Input id="memo_number" {...register("memo_number")} />
          </div>

          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="subject">Subject</Label>
            <Textarea id="subject" rows={3} {...register("subject")} />
          </div>

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
            {errors.received_from_id && (
              <p className="text-sm text-destructive">{errors.received_from_id.message}</p>
            )}
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
            {errors.section_id && <p className="text-sm text-destructive">{errors.section_id.message}</p>}
          </div>

          {serverError && (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {serverError}
            </p>
          )}

          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create Case"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
