"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";

export type LookupState = { error?: string; message?: string };

const nameSchema = z.object({
  name: z.string().trim().min(1, "Enter a section name.").max(200),
});

const idSchema = z.object({
  id: z.string().uuid("Invalid section."),
});

// UI-only convenience check — RLS on public.sections is the real guard.
async function assertAdmin(): Promise<string | null> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    return "Only admins can manage sections.";
  }
  return null;
}

export async function addSection(_prev: LookupState, formData: FormData): Promise<LookupState> {
  const denied = await assertAdmin();
  if (denied) return { error: denied };

  const parsed = nameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.from("sections").insert({ name: parsed.data.name });
  if (error) {
    if (error.code === "23505") {
      return { error: "A section with this name already exists." };
    }
    return { error: "Could not add the section. Please try again." };
  }

  revalidatePath("/sections");
  return { message: `"${parsed.data.name}" added.` };
}

export async function deleteSection(_prev: LookupState, formData: FormData): Promise<LookupState> {
  const denied = await assertAdmin();
  if (denied) return { error: denied };

  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.from("sections").delete().eq("id", parsed.data.id);
  if (error) {
    if (error.code === "23503") {
      return { error: "This section is used by one or more cases and cannot be deleted." };
    }
    return { error: "Could not delete the section. Please try again." };
  }

  revalidatePath("/sections");
  return { message: "Section deleted." };
}
