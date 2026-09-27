import type { Metadata } from "next";
import { LookupManager } from "@/components/lookup/lookup-manager";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";
import { addReceivedFrom, deleteReceivedFrom } from "./actions";

export const metadata: Metadata = { title: "Received From" };

export default async function ReceivedFromPage() {
  const supabase = await createClient();
  const [profile, { data: entries, error }] = await Promise.all([
    getCurrentProfile(),
    supabase.from("received_from").select("id, name, created_at").order("name"),
  ]);

  const isAdmin = profile?.role === "admin";

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Receive Management</h1>
        <p className="text-muted-foreground">
          Sources a case can be received from (e.g. by post, in person, online).
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load the list. Please try again.
        </p>
      ) : (
        <LookupManager
          nameFieldLabel="Name"
          addLabel="Add entry"
          listTitle="All entries"
          emptyMessage="No entries yet."
          deleteTitle="Delete this entry?"
          items={entries ?? []}
          isAdmin={isAdmin}
          addAction={addReceivedFrom}
          deleteAction={deleteReceivedFrom}
        />
      )}
    </div>
  );
}
