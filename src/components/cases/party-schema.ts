import { z } from "zod";
import { PARTY_ROLES } from "./constants";

// Matches the DB check constraint on parties.whatsapp_phone (E.164, e.g. +919876543210).
export const WHATSAPP_PHONE_REGEX = /^\+[1-9][0-9]{7,14}$/;

// One phone number, optionally named (e.g. "Son: 98765...") - matches the office's existing
// case-entry form (Name + Phone Number pairs), and public.parties.phone's jsonb shape.
export const phoneEntrySchema = z.object({
  name: z.string().trim().max(200).optional().or(z.literal("")),
  phone: z.string().trim().min(1, "Enter a phone number."),
});
export type PhoneEntry = z.infer<typeof phoneEntrySchema>;

export const partySchema = z.object({
  id: z.string().uuid().optional(),
  case_id: z.string().uuid(),
  role: z.enum(PARTY_ROLES),
  name: z.string().trim().min(1, "Enter a name.").max(200),
  phone: z.array(phoneEntrySchema).default([]),
  whatsapp_phone: z
    .string()
    .trim()
    .regex(WHATSAPP_PHONE_REGEX, "Use E.164 format, e.g. +919876543210.")
    .optional()
    .or(z.literal("")),
  email: z.string().trim().email("Enter a valid email address.").optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
});

export type PartyInput = z.infer<typeof partySchema>;

// public.parties.phone is `jsonb` (a CHECK constraint guarantees its shape at the DB level, but
// Supabase's generated types can only say `Json` for any jsonb column) — this turns a raw
// database value back into typed phone entries, falling back to an empty list rather than
// throwing if it's ever unexpected shape (defense in depth, not expected to actually trigger).
export function parsePhoneJson(value: unknown): PhoneEntry[] {
  const parsed = z.array(phoneEntrySchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function formatPhones(phone: { name?: string; phone: string }[]): string {
  if (!phone.length) return "—";
  return phone.map((p) => (p.name ? `${p.name}: ${p.phone}` : p.phone)).join(", ");
}

// Converts phone entries from any form (Create Current Entry, the party edit dialog) into
// public.parties.phone's jsonb shape for insert/update: drops rows with no phone number, trims
// name/phone, and omits "name" entirely when blank (matches the DB's optional-name shape) rather
// than storing name: "").
export function toPhoneJson(
  entries: { name?: string; phone: string }[],
): { name?: string; phone: string }[] {
  return entries
    .map((p) => ({ name: (p.name ?? "").trim(), phone: p.phone.trim() }))
    .filter((p) => p.phone)
    .map((p) => (p.name ? p : { phone: p.phone }));
}
