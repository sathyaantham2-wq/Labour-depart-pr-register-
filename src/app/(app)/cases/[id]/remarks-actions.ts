"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type RemarkState = { error?: string; message?: string };

const remarkSchema = z.object({
  case_id: z.string().uuid(),
  text: z.string().trim().min(1, "Enter a remark.").max(2000),
  url: z.string().trim().url("Enter a valid URL.").optional().or(z.literal("")),
});

export async function addRemark(_prev: RemarkState, formData: FormData): Promise<RemarkState> {
  const parsed = remarkSchema.safeParse({
    case_id: formData.get("case_id"),
    text: formData.get("text"),
    url: formData.get("url"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  // `date` defaults to the current IST date in the DB — never sent from the client.
  const { error } = await supabase.from("remarks").insert({
    case_id: parsed.data.case_id,
    text: parsed.data.text,
    url: parsed.data.url || null,
  });
  if (error) return { error: "Could not add the remark. Please try again." };

  revalidatePath(`/cases/${parsed.data.case_id}`);
  return { message: "Remark added." };
}
