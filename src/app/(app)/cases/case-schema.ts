import { z } from "zod";
import { CASE_STATUSES } from "@/components/cases/constants";
import { phoneEntrySchema, WHATSAPP_PHONE_REGEX } from "@/components/cases/party-schema";

// One block of party fields inline in the combined Create Current Entry form. Everything is
// optional — the block only produces a `parties` row (in the Server Action) when a name is
// given, so a case can be created with neither, either, or both parties filled in.
const entryPhoneEntrySchema = phoneEntrySchema.extend({
  // Same shape as the party edit dialog's phoneEntrySchema, but phone itself is allowed empty
  // here (an inline row the user hasn't filled in yet) — filtered out before submit instead of
  // erroring, since this whole block is optional row-by-row.
  phone: z.string().trim(),
});

const entryPartySchema = z.object({
  name: z.string().trim().max(200).optional().or(z.literal("")),
  phone: z.array(entryPhoneEntrySchema).default([]),
  whatsapp_phone: z
    .string()
    .trim()
    .regex(WHATSAPP_PHONE_REGEX, "Use E.164 format, e.g. +919876543210.")
    .optional()
    .or(z.literal("")),
  email: z.string().trim().email("Enter a valid email address.").optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
});
export type EntryPartyInput = z.infer<typeof entryPartySchema>;

export function partyHasDetails(party: EntryPartyInput): boolean {
  return !!(
    party.name ||
    party.phone.some((p) => p.phone.trim()) ||
    party.whatsapp_phone ||
    party.email ||
    party.address
  );
}

// The office register has no Management Name column, so management details may be entered
// without one; the DB requires a non-empty party name, so this fallback is stored instead.
export const DEFAULT_MANAGEMENT_NAME = "Management";

// The combined "Create Current Entry" form, laid out in the office register's column order
// (File Number … Submission Date), with extras (Act, Management Name, WhatsApp, Remark,
// Amount) in an Additional section. One page, one submit.
export const createCaseSchema = z
  .object({
    file_number: z.string().trim().min(1, "Enter a file number.").max(100),
    act: z.string().trim().max(100).optional().or(z.literal("")),
    received_date: z.string().trim().min(1, "Enter the submission date."),
    memo_number: z.string().trim().max(100).optional().or(z.literal("")),
    subject: z.string().trim().max(500).optional().or(z.literal("")),
    received_from_id: z.string().uuid("Select a Receive From.").optional().or(z.literal("")),
    section_id: z.string().uuid("Select a Section.").optional().or(z.literal("")),
    applicant: entryPartySchema,
    management: entryPartySchema,
    remark_text: z.string().trim().max(2000).optional().or(z.literal("")),
    remark_url: z.string().trim().max(500).optional().or(z.literal("")),
    next_hearing_date: z.string().trim().optional().or(z.literal("")),
    status: z.enum(CASE_STATUSES),
    amount_recovered: z.string().trim().optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (partyHasDetails(data.applicant) && !data.applicant.name) {
      ctx.addIssue({ code: "custom", path: ["applicant", "name"], message: "Enter the applicant's name." });
    }
  });
export type CreateCaseInput = z.infer<typeof createCaseSchema>;

export const editCaseSchema = z
  .object({
    received_from_id: z.string().uuid("Select a Receive From.").optional().or(z.literal("")),
    section_id: z.string().uuid("Select a Section.").optional().or(z.literal("")),
    status: z.enum(CASE_STATUSES),
    forwarded_to: z.string().trim().max(200).optional().or(z.literal("")),
    amount_recovered: z.string().trim().optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.status === "forwarded" && !data.forwarded_to) {
      ctx.addIssue({
        code: "custom",
        path: ["forwarded_to"],
        message: "Enter who the case was forwarded to.",
      });
    }
  });
export type EditCaseInput = z.infer<typeof editCaseSchema>;
