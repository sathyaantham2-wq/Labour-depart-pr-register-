"use client";

import { useEffect, useState, useTransition } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { upsertParty } from "@/app/(app)/cases/[id]/party-actions";
import { PARTY_ROLE_LABELS, type PartyRole } from "./constants";
import { partySchema, toPhoneJson, type PhoneEntry } from "./party-schema";

export type PartyRecord = {
  id: string;
  name: string;
  phone: PhoneEntry[];
  whatsapp_phone: string | null;
  email: string | null;
  address: string | null;
};

type FormValues = {
  name: string;
  phone: PhoneEntry[];
  whatsapp_phone: string;
  email: string;
  address: string;
};

function toFormValues(party: PartyRecord | null): FormValues {
  return {
    name: party?.name ?? "",
    phone: party?.phone?.length ? party.phone : [{ name: "", phone: "" }],
    whatsapp_phone: party?.whatsapp_phone ?? "",
    email: party?.email ?? "",
    address: party?.address ?? "",
  };
}

export function PartyForm({
  caseId,
  role,
  party,
}: {
  caseId: string;
  role: PartyRole;
  party: PartyRecord | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: toFormValues(party) });
  const { fields, append, remove } = useFieldArray({ control, name: "phone" });

  useEffect(() => {
    // Re-sync the form whenever the dialog is (re)opened with fresh server data.
    if (open) {
      reset(toFormValues(party));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setServerError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = handleSubmit((values) => {
    const parsed = partySchema.safeParse({
      id: party?.id,
      case_id: caseId,
      role,
      name: values.name,
      phone: toPhoneJson(values.phone),
      whatsapp_phone: values.whatsapp_phone.trim(),
      email: values.email.trim(),
      address: values.address.trim(),
    });

    if (!parsed.success) {
      setServerError("Please fix the highlighted fields.");
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "name" || key === "whatsapp_phone" || key === "email" || key === "address") {
          setError(key, { message: issue.message });
        }
      }
      return;
    }

    setServerError(null);
    startTransition(async () => {
      const result = await upsertParty(parsed.data);
      if (result?.error) {
        setServerError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(`${PARTY_ROLE_LABELS[role]} details saved.`);
      setOpen(false);
    });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant={party ? "outline" : "default"} size="sm" />}>
        {party ? "Edit" : `Add ${PARTY_ROLE_LABELS[role]}`}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{PARTY_ROLE_LABELS[role]} details</DialogTitle>
          <DialogDescription>
            Contact details used for notices and WhatsApp/Email delivery.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor={`${role}-name`}>Name</Label>
            <Input
              id={`${role}-name`}
              {...register("name", { required: "Enter a name." })}
              aria-invalid={!!errors.name}
            />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="grid gap-1.5">
            <Label>Phone numbers</Label>
            <div className="grid gap-2">
              {fields.map((field, index) => (
                <div key={field.id} className="flex gap-2">
                  <Input {...register(`phone.${index}.name`)} placeholder="Name" className="w-32 sm:w-40" />
                  <Input {...register(`phone.${index}.phone`)} placeholder="Phone Number" />
                  <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)}>
                    Remove
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => append({ name: "", phone: "" })}>
                Add phone number
              </Button>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={`${role}-whatsapp`}>WhatsApp number</Label>
            <Input
              id={`${role}-whatsapp`}
              {...register("whatsapp_phone")}
              placeholder="+919876543210"
              aria-invalid={!!errors.whatsapp_phone}
            />
            {errors.whatsapp_phone && (
              <p className="text-sm text-destructive">{errors.whatsapp_phone.message}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={`${role}-email`}>Email</Label>
            <Input
              id={`${role}-email`}
              type="email"
              {...register("email")}
              aria-invalid={!!errors.email}
            />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={`${role}-address`}>Address</Label>
            <Textarea id={`${role}-address`} rows={2} {...register("address")} />
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
