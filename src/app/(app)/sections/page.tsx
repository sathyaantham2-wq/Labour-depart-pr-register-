import type { Metadata } from "next";
import { LookupManager } from "@/components/lookup/lookup-manager";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";
import { addSection, deleteSection } from "./actions";

export const metadata: Metadata = { title: "Sections" };

export default async function SectionsPage() {
  const supabase = await createClient();
  const [profile, { data: sections, error }] = await Promise.all([
    getCurrentProfile(),
    supabase.from("sections").select("id, name, created_at").order("name"),
  ]);

  const isAdmin = profile?.role === "admin";

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Section Management</h1>
        <p className="text-muted-foreground">
          Acts / Sections used when opening a case (e.g. EC, ID, S&amp;E).
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load sections. Please try again.
        </p>
      ) : (
        <LookupManager
          nameFieldLabel="Section name"
          addLabel="Add section"
          listTitle="All sections"
          emptyMessage="No sections yet."
          deleteTitle="Delete this section?"
          items={sections ?? []}
          isAdmin={isAdmin}
          addAction={addSection}
          deleteAction={deleteSection}
        />
      )}
    </div>
  );
}
