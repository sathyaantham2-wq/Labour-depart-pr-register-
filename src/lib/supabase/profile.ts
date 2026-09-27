import "server-only";
import type { Database } from "@/types/database";
import { createClient, getCurrentUser } from "./server";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

// Returns the signed-in user's `profiles` row, or null if signed out or the
// row can't be read. Used for UI-only convenience checks (e.g. hiding
// admin-only controls) — RLS is the real guard, never rely on this alone.
export async function getCurrentProfile(): Promise<Profile | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.sub).single();
  return data ?? null;
}
