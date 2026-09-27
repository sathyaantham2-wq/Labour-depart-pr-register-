"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";

export type StaffState = { error?: string; message?: string };

const roleSchema = z.enum(["admin", "staff"]);

// UI-only convenience check. For updateRole/toggleActive, RLS policy
// "profiles: admin updates" (supabase/migrations/20260927100200_rls.sql) is
// the real guard. inviteStaff uses the service-role admin client, which
// bypasses RLS entirely, so this check is the only guard for it — hence the
// explicit re-check there too (defense in depth).
async function assertAdmin(): Promise<string | null> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    return "Only admins can manage staff.";
  }
  return null;
}

const updateRoleSchema = z.object({
  id: z.string().uuid("Invalid user."),
  role: roleSchema,
});

export async function updateRole(_prev: StaffState, formData: FormData): Promise<StaffState> {
  const denied = await assertAdmin();
  if (denied) return { error: denied };

  const parsed = updateRoleSchema.safeParse({
    id: formData.get("id"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role: parsed.data.role })
    .eq("id", parsed.data.id);

  if (error) return { error: "Could not update the role. Please try again." };

  revalidatePath("/staff");
  return { message: "Role updated." };
}

const toggleActiveSchema = z.object({
  id: z.string().uuid("Invalid user."),
  active: z.enum(["true", "false"]),
});

export async function toggleActive(_prev: StaffState, formData: FormData): Promise<StaffState> {
  const denied = await assertAdmin();
  if (denied) return { error: denied };

  const parsed = toggleActiveSchema.safeParse({
    id: formData.get("id"),
    active: formData.get("active"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const nextActive = parsed.data.active === "true";
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ active: nextActive })
    .eq("id", parsed.data.id);

  if (error) return { error: "Could not update the account. Please try again." };

  revalidatePath("/staff");
  return { message: nextActive ? "Account reactivated." : "Account deactivated." };
}

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  fullName: z.string().trim().min(1, "Enter a full name.").max(200),
  role: roleSchema,
});

export async function inviteStaff(_prev: StaffState, formData: FormData): Promise<StaffState> {
  const denied = await assertAdmin();
  if (denied) return { error: denied };

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    fullName: formData.get("fullName"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const admin = getSupabaseAdmin();
  if (!admin) {
    return {
      error:
        "Service role key not configured — add SUPABASE_SERVICE_ROLE_KEY to .env.local to enable inviting new staff.",
    };
  }

  const { email, fullName, role } = parsed.data;

  // Sends the invite email and creates the auth.users row. handle_new_user
  // (supabase/migrations/20260927100100_triggers.sql) reads
  // raw_app_meta_data->>'role' at insert time to set profiles.role — but
  // inviteUserByEmail's options only let us set user_metadata ("data"), not
  // app_metadata, so the trigger will insert this row with the 'staff'
  // default first. We correct it below: once for auth.users.app_metadata
  // (so it's right for any future reference to it) and once via a direct
  // profiles update as the signed-in admin (allowed by the "profiles: admin
  // updates" RLS policy), which is what actually makes the role correct
  // immediately.
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
  });

  if (error) {
    const message = error.message?.toLowerCase() ?? "";
    if (message.includes("already been registered") || message.includes("already registered")) {
      return { error: "A user with this email already exists." };
    }
    return { error: `Could not invite the user: ${error.message}` };
  }

  const userId = data.user?.id;
  if (!userId) {
    return {
      error: "Invite sent, but could not confirm the new user. Check Staff Management shortly.",
    };
  }

  // Best-effort — a failure here doesn't block the invite or the profiles
  // update below.
  await admin.auth.admin.updateUserById(userId, { app_metadata: { role } });

  const supabase = await createClient();
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ role, full_name: fullName })
    .eq("id", userId);

  if (profileError) {
    return {
      error:
        "Invite sent, but the role could not be set. Update it from the table below once the invite is accepted.",
    };
  }

  revalidatePath("/staff");
  return { message: `Invite sent to ${email}.` };
}
