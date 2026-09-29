"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Controller, useForm, type Control, type Path } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  partyFieldsDefaults,
  PartyAddressField,
  PartyEmailField,
  PartyNameField,
  PartyPhonesField,
  PartyWhatsappField,
  type PartyFieldsValues,
} from "@/components/cases/party-fields";
import { CASE_STATUS_LABELS, CASE_STATUSES } from "@/components/cases/constants";
import { createCaseSchema, type CreateCaseInput } from "../case-schema";
import { createCase } from "./actions";

type Lookup = { id: string; name: string };

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

function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-t pt-6 first:border-t-0 first:pt-0 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <h2 className="font-heading text-sm font-semibold">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-sm text-destructive">{message}</p> : null;
}

function RequiredMark() {
  return <span className="text-destructive" aria-hidden="true">*</span>;
}

function LookupSelect({
  id,
  name,
  control,
  options,
}: {
  id: string;
  name: "section_id" | "received_from_id";
  control: Control<CaseFormValues>;
  options: Lookup[];
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Select value={field.value || undefined} onValueChange={(value) => field.onChange(value ?? "")}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  );
}

export function CaseForm({ sections, receivedFrom }: { sections: Lookup[]; receivedFrom: Lookup[] }) {
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<CaseFormValues>({ defaultValues: emptyValues });

  const onSubmit = handleSubmit((values) => {
    const parsed = createCaseSchema.safeParse(values);
    if (!parsed.success) {
      setServerError("Please fix the highlighted fields.");
      for (const issue of parsed.error.issues) {
        setError(issue.path.join(".") as Path<CaseFormValues>, { message: issue.message });
      }
      return;
    }

    setServerError(null);
    startTransition(async () => {
      const result = await createCase(parsed.data);
      if (result?.error) {
        setServerError(result.error);
        toast.error(result.error);
        for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
          setError(field as Path<CaseFormValues>, { message });
        }
      }
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Current Entry</CardTitle>
        <CardDescription>
          Fields follow the office register&apos;s column order. <RequiredMark /> marks required fields.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-6" noValidate>
          <FormSection title="Entry">
            <div className="grid gap-1.5">
              <Label htmlFor="file_number">
                File Number <RequiredMark />
              </Label>
              <Input id="file_number" {...register("file_number")} aria-invalid={!!errors.file_number} />
              <FieldError message={errors.file_number?.message} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="memo_number">Memo Number</Label>
              <Input id="memo_number" {...register("memo_number")} />
            </div>
          </FormSection>

          <FormSection title="Applicant">
            <PartyNameField<CaseFormValues> role="applicant" register={register} errors={errors.applicant} />
            <PartyPhonesField<CaseFormValues> role="applicant" register={register} control={control} />
            <PartyEmailField<CaseFormValues> role="applicant" register={register} errors={errors.applicant} />
            <PartyAddressField<CaseFormValues> role="applicant" register={register} />
          </FormSection>

          <FormSection title="Management" description="Management Name is optional — it's under Additional Details below.">
            <PartyPhonesField<CaseFormValues> role="management" register={register} control={control} />
            <PartyEmailField<CaseFormValues> role="management" register={register} errors={errors.management} />
            <PartyAddressField<CaseFormValues> role="management" register={register} className="sm:col-span-2" />
          </FormSection>

          <FormSection title="Entry Details">
            <div className="grid gap-1.5">
              <Label htmlFor="section_id">Section</Label>
              <LookupSelect id="section_id" name="section_id" control={control} options={sections} />
              <FieldError message={errors.section_id?.message} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="received_from_id">Receive From</Label>
              <LookupSelect id="received_from_id" name="received_from_id" control={control} options={receivedFrom} />
              <FieldError message={errors.received_from_id?.message} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="next_hearing_date">Hearing Date</Label>
              <Input id="next_hearing_date" type="date" {...register("next_hearing_date")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="status">Status</Label>
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
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="subject">Subject</Label>
              <Textarea id="subject" rows={3} {...register("subject")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="received_date">
                Submission Date <RequiredMark />
              </Label>
              <Input id="received_date" type="date" {...register("received_date")} aria-invalid={!!errors.received_date} />
              <FieldError message={errors.received_date?.message} />
            </div>
          </FormSection>

          <FormSection title="Additional Details" description="Optional — not in the office register, used by this app.">
            <div className="grid gap-1.5">
              <Label htmlFor="act">Act</Label>
              <Input id="act" {...register("act")} placeholder="e.g. EC, ID, S&E" />
            </div>
            <PartyNameField<CaseFormValues> role="management" register={register} errors={errors.management} />
            <PartyWhatsappField<CaseFormValues> role="applicant" register={register} errors={errors.applicant} />
            <PartyWhatsappField<CaseFormValues> role="management" register={register} errors={errors.management} />
            <div className="grid gap-1.5">
              <Label htmlFor="remark_text">Remark</Label>
              <Textarea id="remark_text" rows={2} {...register("remark_text")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="remark_url">Remark URL</Label>
              <Input id="remark_url" {...register("remark_url")} placeholder="Supporting link" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="amount_recovered">Amount Recovered (₹)</Label>
              <Input
                id="amount_recovered"
                inputMode="decimal"
                {...register("amount_recovered")}
                aria-invalid={!!errors.amount_recovered}
              />
              <FieldError message={errors.amount_recovered?.message} />
            </div>
          </FormSection>

          {serverError && (
            <p role="alert" className="text-sm text-destructive">
              {serverError}
            </p>
          )}

          <div className="flex justify-end border-t pt-6">
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Creating…" : "Create Current Entry"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
