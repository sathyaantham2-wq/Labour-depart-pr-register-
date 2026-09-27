import { z } from "zod";
import { PARTY_ROLES } from "./constants";

// Matches the DB check constraint on parties.whatsapp_phone (E.164, e.g. +919876543210).
export const WHATSAPP_PHONE_REGEX = /^\+[1-9][0-9]{7,14}$/;

export const partySchema = z.object({
  id: z.string().uuid().optional(),
  case_id: z.string().uuid(),
  role: z.enum(PARTY_ROLES),
  name: z.string().trim().min(1, "Enter a name.").max(200),
  phone: z.array(z.string().trim().min(1)).default([]),
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
