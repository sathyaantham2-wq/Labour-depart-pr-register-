"use server";

import { redirect } from "next/navigation";
import { createCaseSchema, type CreateCaseInput } from "../case-schema";
import { createClient } from "@/lib/supabase/server";

export type CreateCaseResult = { error?: string; fieldErrors?: Record<string, string> };

export async function createCase(input: CreateCaseInput): Promise<CreateCaseResult> {
  const parsed = createCaseSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }

  const { file_number, act, received_date, memo_number, subject, received_from_id, section_id } =
    parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cases")
    .insert({
      file_number,
      act,
      received_date,
      memo_number: memo_number || null,
      subject: subject || "",
      received_from_id: received_from_id || null,
      section_id: section_id || null,
      // assigned_officer_id / created_by default to auth.uid() in the DB; RLS also
      // enforces staff can only create cases assigned to themselves.
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "A case with this file number already exists." };
    }
    return { error: "Could not create the case. Please try again." };
  }

  redirect(`/cases/${data.id}`);
}
