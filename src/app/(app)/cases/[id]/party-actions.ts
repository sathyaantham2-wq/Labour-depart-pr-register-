"use server";

import { revalidatePath } from "next/cache";
import { partySchema, type PartyInput } from "@/components/cases/party-schema";
import { createClient } from "@/lib/supabase/server";

export type PartyActionResult = { error?: string };

// Adds or updates the applicant/management party on a case. There is currently no DB
// constraint enforcing one row per (case_id, role) — see report back to db-architect —
// so when no id is supplied we look up an existing row for the role first and update
// it instead of inserting a duplicate.
export async function upsertParty(input: PartyInput): Promise<PartyActionResult> {
  const parsed = partySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid party details." };
  }
  const { id, case_id, role, name, phone, whatsapp_phone, email, address } = parsed.data;

  const supabase = await createClient();

  const payload = {
    case_id,
    role,
    name,
    phone,
    whatsapp_phone: whatsapp_phone || null,
    email: email || null,
    address: address || null,
  };

  let targetId = id ?? null;
  if (!targetId) {
    const { data: existing } = await supabase
      .from("parties")
      .select("id")
      .eq("case_id", case_id)
      .eq("role", role)
      .maybeSingle();
    targetId = existing?.id ?? null;
  }

  const { error } = targetId
    ? await supabase.from("parties").update(payload).eq("id", targetId)
    : await supabase.from("parties").insert(payload);

  if (error) {
    if (error.code === "23514") {
      return { error: "WhatsApp number must be in +91XXXXXXXXXX format." };
    }
    return { error: "Could not save the party details. Please try again." };
  }

  revalidatePath(`/cases/${case_id}`);
  return {};
}
