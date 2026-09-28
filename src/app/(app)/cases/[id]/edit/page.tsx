import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CaseStatus } from "@/components/cases/constants";
import { createClient } from "@/lib/supabase/server";
import { EditCaseForm } from "./edit-form";

export const metadata: Metadata = { title: "Edit Entry" };

export default async function EditCasePage({ params }: PageProps<"/cases/[id]/edit">) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: caseRow, error }, { data: sections }, { data: receivedFrom }] = await Promise.all([
    supabase
      .from("cases")
      .select("id, file_number, received_from_id, section_id, status, forwarded_to, amount_recovered")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("sections").select("id, name").order("name"),
    supabase.from("received_from").select("id, name").order("name"),
  ]);

  if (error || !caseRow) notFound();

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Edit Entry {caseRow.file_number}</h1>
      </div>
      <EditCaseForm
        caseId={caseRow.id}
        sections={sections ?? []}
        receivedFrom={receivedFrom ?? []}
        defaultValues={{
          received_from_id: caseRow.received_from_id ?? "",
          section_id: caseRow.section_id ?? "",
          status: caseRow.status as CaseStatus,
          forwarded_to: caseRow.forwarded_to ?? "",
          amount_recovered: caseRow.amount_recovered != null ? String(caseRow.amount_recovered) : "",
        }}
      />
    </div>
  );
}
