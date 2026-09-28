"use server";

import { redirect } from "next/navigation";
import { createCaseSchema, type CreateCaseInput, type EntryPartyInput } from "../case-schema";
import { toPhoneJson } from "@/components/cases/party-schema";
import { createClient } from "@/lib/supabase/server";

export type CreateCaseResult = { error?: string; fieldErrors?: Record<string, string> };

function partyInsert(caseId: string, role: "applicant" | "management", party: EntryPartyInput) {
  return {
    case_id: caseId,
    role,
    name: (party.name ?? "").trim(),
    phone: toPhoneJson(party.phone),
    whatsapp_phone: party.whatsapp_phone || null,
    email: party.email || null,
    address: party.address || null,
  };
}

// Creates a case together with everything the combined Create Current Entry form collects in
// one go (matches the tapace.com reference: one page, one submit) — Applicant/Management
// parties, an initial remark, and a first hearing, in addition to the case row itself. All of
// these sub-fields are optional; only the ones actually filled in produce a row. A failure on
// any of these secondary inserts does not fail the whole request (the case itself is the
// important part, and it already exists by the time these run) — it's logged, and whatever
// didn't save can be added afterward from the Case Details page's own Add Applicant/Management/
// Hearing/Remark actions, which cover exactly the same fields.
export async function createCase(input: CreateCaseInput): Promise<CreateCaseResult> {
  const parsed = createCaseSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }

  const {
    file_number,
    act,
    received_date,
    memo_number,
    subject,
    received_from_id,
    section_id,
    applicant,
    management,
    remark_text,
    remark_url,
    next_hearing_date,
    status,
    amount_recovered,
  } = parsed.data;

  const supabase = await createClient();

  let amountValue: number | null = null;
  if (amount_recovered) {
    const n = Number(amount_recovered);
    if (Number.isNaN(n) || n < 0) {
      return { error: "Please fix the highlighted fields.", fieldErrors: { amount_recovered: "Enter a valid amount." } };
    }
    amountValue = n;
  }

  const { data: caseRow, error: caseError } = await supabase
    .from("cases")
    .insert({
      file_number,
      act: act || null,
      received_date,
      memo_number: memo_number || null,
      subject: subject || "",
      received_from_id: received_from_id || null,
      section_id: section_id || null,
      status,
      amount_recovered: amountValue,
      // assigned_officer_id / created_by default to auth.uid() in the DB; RLS also
      // enforces staff can only create cases assigned to themselves.
    })
    .select("id")
    .single();

  if (caseError) {
    if (caseError.code === "23505") {
      return { error: "A case with this file number already exists." };
    }
    return { error: "Could not create the case. Please try again." };
  }

  const caseId: string = caseRow.id;

  if ((applicant.name ?? "").trim()) {
    const { error } = await supabase.from("parties").insert(partyInsert(caseId, "applicant", applicant));
    if (error) console.error("createCase: failed to save applicant", error);
  }
  if ((management.name ?? "").trim()) {
    const { error } = await supabase.from("parties").insert(partyInsert(caseId, "management", management));
    if (error) console.error("createCase: failed to save management", error);
  }
  const remarkText = (remark_text ?? "").trim();
  if (remarkText) {
    const { error } = await supabase
      .from("remarks")
      .insert({ case_id: caseId, text: remarkText, url: (remark_url ?? "").trim() || null });
    if (error) console.error("createCase: failed to save remark", error);
  }
  const hearingDate = (next_hearing_date ?? "").trim();
  if (hearingDate) {
    const { error } = await supabase
      .from("hearings")
      .insert({ case_id: caseId, hearing_date: hearingDate, status: "scheduled" });
    if (error) console.error("createCase: failed to save hearing", error);
  }

  redirect(`/cases/${caseId}`);
}
