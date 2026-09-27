"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { HEARING_STATUSES } from "@/components/cases/constants";
import { createClient } from "@/lib/supabase/server";

export type HearingActionResult = { error?: string };

const addHearingSchema = z.object({
  case_id: z.string().uuid(),
  hearing_date: z.string().trim().min(1, "Enter a hearing date."),
  hearing_time: z.string().trim().optional().or(z.literal("")),
});
export type AddHearingInput = z.infer<typeof addHearingSchema>;

const updateHearingSchema = z.object({
  id: z.string().uuid(),
  case_id: z.string().uuid(),
  hearing_date: z.string().trim().min(1, "Enter a hearing date."),
  hearing_time: z.string().trim().optional().or(z.literal("")),
  status: z.enum(HEARING_STATUSES),
  outcome_notes: z.string().trim().max(1000).optional().or(z.literal("")),
});
export type UpdateHearingInput = z.infer<typeof updateHearingSchema>;

// The DB trigger hearings_sync_next keeps cases.next_hearing_date in sync with
// scheduled hearings — we only ever write to the hearings table here.
export async function addHearing(input: AddHearingInput): Promise<HearingActionResult> {
  const parsed = addHearingSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid hearing." };

  const supabase = await createClient();
  const { error } = await supabase.from("hearings").insert({
    case_id: parsed.data.case_id,
    hearing_date: parsed.data.hearing_date,
    hearing_time: parsed.data.hearing_time || null,
  });
  if (error) return { error: "Could not add the hearing. Please try again." };

  revalidatePath(`/cases/${parsed.data.case_id}`);
  return {};
}

export async function updateHearing(input: UpdateHearingInput): Promise<HearingActionResult> {
  const parsed = updateHearingSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid hearing." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("hearings")
    .update({
      hearing_date: parsed.data.hearing_date,
      hearing_time: parsed.data.hearing_time || null,
      status: parsed.data.status,
      outcome_notes: parsed.data.outcome_notes || null,
    })
    .eq("id", parsed.data.id);
  if (error) return { error: "Could not update the hearing. Please try again." };

  revalidatePath(`/cases/${parsed.data.case_id}`);
  return {};
}
