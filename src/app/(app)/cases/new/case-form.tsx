"use client";

import { useState, useTransition } from "react";
import { Controller, useForm, type Path } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { partyFieldsDefaults, PartyFields, type PartyFieldsValues } from "@/components/cases/party-fields";
import { CASE_STATUS_LABELS, CASE_STATUSES } from "@/components/cases/constants";
import { createCaseSchema, type CreateCaseInput } from "../case-schema";
import { createCase } from "./actions";

type Lookup = { id: string; name: string };

// RHF's own form state — distinct from CreateCaseInput (the Zod-validated submit shape).
// Phone numbers are held as {value}[] here so useFieldArray has stable keys; mapped down to a
// plain string[] in onSubmit before validating against createCaseSchema. Same split used in
// components/cases/party-form.tsx for the same reason.
type CaseFormValues = {
  file_number: string;
  act: string;
  received_date: string;
  memo_number: string;
  subject: string;
  received_from_id: string;
  section_id: string;
  applicant: PartyFieldsValues;
  management: PartyFieldsValues;
  remark_text: string;
  remark_url: string;
  next_hearing_date: string;
  status: CreateCaseInput["status"];
  amount_recovered: string;
};

const emptyValues: CaseFormValues = {
  file_number: "",
  act: "",
  received_date: "",
  memo_number: "",
  subject: "",
  received_from_id: "",
  section_id: "",
  applicant: partyFieldsDefaults(),
  management: partyFieldsDefaults(),
  remark_text: "",
  remark_url: "",
  next_hearing_date: "",
  status: "open",
  amount_recovered: "",
};

function toSubmitInput(values: CaseFormValues): CreateCaseInput {
  return {
    ...values,
    applicant: { ...values.applicant, phone: values.applicant.phone.map((p) => p.value) },
    management: { ...values.management, phone: values.management.phone.map((p) => p.value) },
  };
}

export function CaseForm({ sections, receivedFrom }: { sections: Lookup[]; receivedFrom: Lookup[] }) {
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    watch,
    setError,
    formState: { errors },
  } = useForm<CaseFormValues>({ defaultValues: emptyValues });

  // Applicant/Management sections only appear once a Section is chosen — matches the
  // tapace.com reference form's flow. This is a UI convenience only: Section itself is still
  // optional at the database/validation level, unchanged from before.
  const sectionChosen = !!watch("section_id");

  const onSubmit = handleSubmit((values) => {
    const submitInput = toSubmitInput(values);
    const parsed = createCaseSchema.safeParse(submitInput);
    if (!parsed.success) {
      setServerError("Please fix the highlighted fields.");
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") as Path<CaseFormValues>;
        setError(key, { message: issue.message });
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
            setError(field as Path<CaseFormValues>, { message });
          }
        }
      }
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Current Entry</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-8">
          <section className="grid gap-4 sm:grid-cols-2">
            <h2 className="text-sm font-medium text-muted-foreground sm:col-span-2">Basic Information</h2>

            <div className="grid gap-1.5">
              <Label htmlFor="file_number">File Number</Label>
              <Input id="file_number" {...register("file_number")} aria-invalid={!!errors.file_number} />
              {errors.file_number && <p className="text-sm text-destructive">{errors.file_number.message}</p>}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="act">Act</Label>
              <Input id="act" {...register("act")} placeholder="e.g. EC, ID, S&E" aria-invalid={!!errors.act} />
              {errors.act && <p className="text-sm text-destructive">{errors.act.message}</p>}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="received_date">Received Date</Label>
              <Input id="received_date" type="date" {...register("received_date")} aria-invalid={!!errors.received_date} />
              {errors.received_date && <p className="text-sm text-destructive">{errors.received_date.message}</p>}
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
                  <Select value={field.value || undefined} onValueChange={(value) => field.onChange(value ?? "")}>
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
              {errors.received_from_id && <p className="text-sm text-destructive">{errors.received_from_id.message}</p>}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="section_id">Section</Label>
              <Controller
                control={control}
                name="section_id"
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={(value) => field.onChange(value ?? "")}>
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
              {!sectionChosen && (
                <p className="text-xs text-muted-foreground">Choose a Section to enter Applicant and Management details.</p>
              )}
            </div>
          </section>

          {sectionChosen && (
            <>
              <section className="grid gap-4">
                <h2 className="text-sm font-medium text-muted-foreground">Applicant Information</h2>
                <PartyFields<CaseFormValues>
                  role="applicant"
                  namePrefix="applicant"
                  register={register}
                  control={control}
                  errors={errors.applicant}
                />
              </section>

              <section className="grid gap-4">
                <h2 className="text-sm font-medium text-muted-foreground">Management Information</h2>
                <PartyFields<CaseFormValues>
                  role="management"
                  namePrefix="management"
                  register={register}
                  control={control}
                  errors={errors.management}
                />
              </section>
            </>
          )}

          <section className="grid gap-4 sm:grid-cols-2">
            <h2 className="text-sm font-medium text-muted-foreground sm:col-span-2">Additional Information</h2>

            <div className="grid gap-1.5">
              <Label htmlFor="remark_text">Remark Text</Label>
              <Textarea id="remark_text" rows={2} {...register("remark_text")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="remark_url">URL</Label>
              <Input id="remark_url" {...register("remark_url")} placeholder="Supporting link (optional)" />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="next_hearing_date">Next Date of Hearing</Label>
              <Input id="next_hearing_date" type="date" {...register("next_hearing_date")} />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="status">Final Status</Label>
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
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

            <div className="grid gap-1.5">
              <Label htmlFor="amount_recovered">Amount (₹)</Label>
              <Input id="amount_recovered" inputMode="decimal" {...register("amount_recovered")} aria-invalid={!!errors.amount_recovered} />
              {errors.amount_recovered && <p className="text-sm text-destructive">{errors.amount_recovered.message}</p>}
            </div>
          </section>

          {serverError && (
            <p role="alert" className="text-sm text-destructive">
              {serverError}
            </p>
          )}

          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create Current Entry"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
