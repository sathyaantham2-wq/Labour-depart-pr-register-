"use client";

import { useFieldArray, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PARTY_ROLE_LABELS, type PartyRole } from "./constants";

// Shared Name / Phone numbers / WhatsApp / Email / Address block, used inline in the combined
// Create Current Entry form. (The existing per-party edit dialog on the Case Details page,
// PartyForm, has its own copy of this same shape — left as-is since it's already shipped and
// tested; this component is for new form surfaces, not a retrofit of that one.)
//
// Phone numbers are a simple repeatable list, no name attached to each entry — the tapace.com
// reference shows a "Name" box next to each phone number, but nothing in this app's data model
// needs a name-per-phone-number, and adding one would need a schema change. Flagged to the user;
// happy to add it if actually wanted.

export type PartyFieldsValues = {
  name: string;
  phone: { value: string }[];
  whatsapp_phone: string;
  email: string;
  address: string;
};

// Any form that embeds an applicant + management block of this shape (Create Current Entry is
// the only one today) can use PartyFields against its own values type by satisfying this.
export type PartyFieldsFormShape = { applicant: PartyFieldsValues; management: PartyFieldsValues };

export function partyFieldsDefaults(): PartyFieldsValues {
  return { name: "", phone: [{ value: "" }], whatsapp_phone: "", email: "", address: "" };
}

export function PartyFields<TFormValues extends PartyFieldsFormShape>({
  role,
  namePrefix,
  register,
  control,
  errors,
}: {
  role: PartyRole;
  namePrefix: "applicant" | "management";
  register: UseFormRegister<TFormValues>;
  control: Control<TFormValues>;
  errors?: FieldErrors<PartyFieldsValues>;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: `${namePrefix}.phone` as never });
  const label = PARTY_ROLE_LABELS[role];

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor={`${namePrefix}-name`}>{label} Name</Label>
        <Input id={`${namePrefix}-name`} {...register(`${namePrefix}.name` as never)} aria-invalid={!!errors?.name} />
        {errors?.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>

      <div className="grid gap-1.5">
        <Label>{label} Phone Numbers</Label>
        <div className="grid gap-2">
          {fields.map((field, index) => (
            <div key={field.id} className="flex gap-2">
              <Input {...register(`${namePrefix}.phone.${index}.value` as never)} placeholder="10-digit or +91…" />
              {fields.length > 1 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)}>
                  Remove
                </Button>
              )}
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => append({ value: "" } as never)}>
            Add phone number
          </Button>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`${namePrefix}-whatsapp`}>{label} WhatsApp Number</Label>
        <Input
          id={`${namePrefix}-whatsapp`}
          {...register(`${namePrefix}.whatsapp_phone` as never)}
          placeholder="+919876543210"
          aria-invalid={!!errors?.whatsapp_phone}
        />
        <p className="text-xs text-muted-foreground">
          Used for WhatsApp notice delivery. Not on the tapace.com form — added for this app&apos;s notification feature.
        </p>
        {errors?.whatsapp_phone && <p className="text-sm text-destructive">{errors.whatsapp_phone.message}</p>}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`${namePrefix}-email`}>{label} Email</Label>
        <Input id={`${namePrefix}-email`} type="email" {...register(`${namePrefix}.email` as never)} aria-invalid={!!errors?.email} />
        {errors?.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`${namePrefix}-address`}>{label} Address</Label>
        <Textarea id={`${namePrefix}-address`} rows={2} {...register(`${namePrefix}.address` as never)} />
      </div>
    </div>
  );
}
