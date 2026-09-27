import type { Metadata } from "next";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Data Import" };

// Admin-only, one-time load of legacy cases from a spreadsheet (Screens tab).
// UI-only gate — RLS is what actually stops a non-admin from inserting cases.
export default async function DataImportPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    return (
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold">Data Import</h1>
        <p className="text-muted-foreground">Admins only.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: sections }, { data: receivedFrom }] = await Promise.all([
    supabase.from("sections").select("id, name").order("name"),
    supabase.from("received_from").select("id, name").order("name"),
  ]);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Data Import</h1>
        <p className="text-muted-foreground">
          One-time load of legacy cases from a spreadsheet. Upload a .xlsx or .csv file, map its
          columns, review the preview, then confirm.
        </p>
      </div>
      <ImportWizard sections={sections ?? []} receivedFrom={receivedFrom ?? []} />
    </div>
  );
}
