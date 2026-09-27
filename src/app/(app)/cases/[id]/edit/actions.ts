"use server";

import { redirect } from "next/navigation";
import { editCaseSchema, type EditCaseInput } from "../../case-schema";
import { createClient } from "@/lib/supabase/server";

export type EditCaseResult = { error?: string; fieldErrors?: Record<string, string> };

export async function updateCase(caseId: string, input: EditCaseInput): Promise<EditCaseResult> {
  const parsed = editCaseSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }

  const { received_from_id, section_id, status, forwarded_to, amount_recovered } = parsed.data;

  let amount: number | null = null;
  if (amount_recovered) {
    const n = Number(amount_recovered);
    if (Number.isNaN(n) || n < 0) {
      return {
        error: "Please fix the highlighted fields.",
        fieldErrors: { amount_recovered: "Enter a non-negative amount." },
      };
    }
    amount = n;
  }

  const supabase = await createClient();
  // status history and closed_at are trigger-maintained (see set_case_closed_at /
  // log_case_status in supabase/migrations/20260927100100_triggers.sql) — we only
  // ever write cases.status here, never closed_at directly.
  const { error } = await supabase
    .from("cases")
    .update({
      received_from_id: received_from_id || null,
      section_id: section_id || null,
      status,
      forwarded_to: status === "forwarded" ? forwarded_to || null : null,
      amount_recovered: amount,
    })
    .eq("id", caseId);

  if (error) {
    return { error: "Could not update the case. Please try again." };
  }

  redirect(`/cases/${caseId}`);
}
