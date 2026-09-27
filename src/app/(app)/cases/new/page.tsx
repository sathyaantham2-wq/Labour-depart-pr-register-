import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { CaseForm } from "./case-form";

export const metadata: Metadata = { title: "New Case" };

export default async function NewCasePage() {
  const supabase = await createClient();
  const [{ data: sections }, { data: receivedFrom }] = await Promise.all([
    supabase.from("sections").select("id, name").order("name"),
    supabase.from("received_from").select("id, name").order("name"),
  ]);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Create Current Entry</h1>
        <p className="text-muted-foreground">Open a new case file. It will be assigned to you.</p>
      </div>
      <CaseForm sections={sections ?? []} receivedFrom={receivedFrom ?? []} />
    </div>
  );
}
