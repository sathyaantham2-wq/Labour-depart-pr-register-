"use client";

import { useFieldArray, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PARTY_ROLE_LABELS, type PartyRole } from "./constants";

// Individual Applicant/Management fields for the Create Current Entry form. Split into one
// component per field (rather than one block per party) so the form can lay them out in the
// office's own register column order, where e.g. Management Name sits apart from the rest.

export type PartyFieldsValues = {
  name: string;
  phone: { name: string; phone: string }[];
  whatsapp_phone: string;
  email: string;
  address: string;
};

export type PartyFieldsFormShape = { applicant: PartyFieldsValues; management: PartyFieldsValues };

export function partyFieldsDefaults(): PartyFieldsValues {
  return { name: "", phone: [{ name: "", phone: "" }], whatsapp_phone: "", email: "", address: "" };
}

type FieldProps<T extends PartyFieldsFormShape> = {
  role: PartyRole;
  register: UseFormRegister<T>;
  errors?: FieldErrors<PartyFieldsValues>;
  className?: string;
};

export function PartyNameField<T extends PartyFieldsFormShape>({ role, register, errors, className }: FieldProps<T>) {
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={`${role}-name`}>{PARTY_ROLE_LABELS[role]} Name</Label>
      <Input id={`${role}-name`} {...register(`${role}.name` as never)} aria-invalid={!!errors?.name} />
      {errors?.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
    </div>
  );
}

export function PartyPhonesField<T extends PartyFieldsFormShape>({
  role,
  register,
  control,
  className,
}: FieldProps<T> & { control: Control<T> }) {
  const { fields, append, remove } = useFieldArray({ control, name: `${role}.phone` as never });
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={`${role}-phone-0`}>{PARTY_ROLE_LABELS[role]} Phone</Label>
      <div className="grid gap-2">
        {fields.map((field, index) => (
          <div key={field.id} className="flex gap-2">
            <Input
              {...register(`${role}.phone.${index}.name` as never)}
              placeholder="Name"
              aria-label={`${PARTY_ROLE_LABELS[role]} phone ${index + 1} name`}
              className="w-32 sm:w-36"
            />
            <Input
              id={`${role}-phone-${index}`}
              {...register(`${role}.phone.${index}.phone` as never)}
              placeholder="Phone number"
              inputMode="tel"
            />
            {fields.length > 1 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)}>
                Remove
              </Button>
            )}
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={() => append({ name: "", phone: "" } as never)}
        >
          Add phone number
        </Button>
      </div>
    </div>
  );
}

export function PartyEmailField<T extends PartyFieldsFormShape>({ role, register, errors, className }: FieldProps<T>) {
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={`${role}-email`}>{PARTY_ROLE_LABELS[role]} Email</Label>
      <Input id={`${role}-email`} type="email" {...register(`${role}.email` as never)} aria-invalid={!!errors?.email} />
      {errors?.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
    </div>
  );
}

export function PartyAddressField<T extends PartyFieldsFormShape>({ role, register, className }: FieldProps<T>) {
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={`${role}-address`}>{PARTY_ROLE_LABELS[role]} Address</Label>
      <Textarea id={`${role}-address`} rows={2} {...register(`${role}.address` as never)} />
    </div>
  );
}

export function PartyWhatsappField<T extends PartyFieldsFormShape>({ role, register, errors, className }: FieldProps<T>) {
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={`${role}-whatsapp`}>{PARTY_ROLE_LABELS[role]} WhatsApp Number</Label>
      <Input
        id={`${role}-whatsapp`}
        {...register(`${role}.whatsapp_phone` as never)}
        placeholder="+919876543210"
        aria-invalid={!!errors?.whatsapp_phone}
      />
      {errors?.whatsapp_phone && <p className="text-sm text-destructive">{errors.whatsapp_phone.message}</p>}
    </div>
  );
}
