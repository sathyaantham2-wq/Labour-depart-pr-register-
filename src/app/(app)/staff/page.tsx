import type { Metadata } from "next";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";
import { InviteStaffForm } from "./invite-staff-form";
import { StaffTable } from "./staff-table";

export const metadata: Metadata = { title: "Staff Management" };

export default async function StaffPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    return (
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold">Staff Management</h1>
        <p className="text-muted-foreground">Admins only.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: staff, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, active")
    .order("full_name");

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Staff Management</h1>
        <p className="text-muted-foreground">Manage officer accounts — role and active status.</p>
      </div>

      <InviteStaffForm />

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load staff. Please try again.
        </p>
      ) : (
        <StaffTable staff={staff ?? []} currentUserId={profile.id} />
      )}
    </div>
  );
}
