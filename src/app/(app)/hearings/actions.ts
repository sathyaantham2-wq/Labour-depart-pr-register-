"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isIsoDate, todayIST } from "@/lib/calendar-dates";
import { createClient } from "@/lib/supabase/server";

const outcomeSchema = z
  .object({
    hearing_id: z.string().uuid(),
    case_id: z.string().uuid(),
    outcome: z.enum(["held", "adjourned", "cancelled"]),
    next_date: z.string().trim().optional().or(z.literal("")),
    notes: z.string().trim().max(1000).optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.outcome === "adjourned" && !data.next_date) {
      ctx.addIssue({ code: "custom", path: ["next_date"], message: "Pick the adjourned-to date." });
    }
    if (data.next_date) {
      if (!isIsoDate(data.next_date)) {
        ctx.addIssue({ code: "custom", path: ["next_date"], message: "Enter a valid date." });
      } else if (data.next_date < todayIST()) {
        ctx.addIssue({ code: "custom", path: ["next_date"], message: "The next date can't be in the past." });
      }
    }
  });
export type HearingOutcomeInput = z.infer<typeof outcomeSchema>;
export type HearingOutcomeResult = { error?: string };

// Records what happened at a hearing and, if a next date is given, schedules the follow-up
// hearing in the same step. cases.next_hearing_date follows automatically via the
// hearings_sync_next trigger. RLS limits staff to hearings on their own entries.
export async function recordHearingOutcome(input: HearingOutcomeInput): Promise<HearingOutcomeResult> {
  const parsed = outcomeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const { hearing_id, case_id, outcome, next_date, notes } = parsed.data;

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("hearings")
    .update({ status: outcome, ...(notes ? { outcome_notes: notes } : {}) })
    .eq("id", hearing_id)
    .eq("case_id", case_id)
    .select("id");
  if (error || !updated?.length) return { error: "Could not update this hearing. Please try again." };

  if (next_date) {
    const { error: insertError } = await supabase
      .from("hearings")
      .insert({ case_id, hearing_date: next_date, status: "scheduled" });
    if (insertError) {
      return { error: "The hearing was updated, but the next date could not be scheduled. Add it from the entry page." };
    }
  }

  revalidatePath("/hearings");
  revalidatePath("/dashboard");
  revalidatePath(`/cases/${case_id}`);
  return {};
}
