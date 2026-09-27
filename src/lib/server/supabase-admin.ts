import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { supabaseEnv } from "@/lib/supabase/env";

// Admin-only Supabase client authenticated with the service role key —
// bypasses RLS entirely. Never import this into a client component, and only
// call it from Server Actions / route handlers that have already verified
// the caller is an admin (see src/app/(app)/staff/actions.ts).
//
// Returns null instead of throwing when the key isn't configured yet, so
// callers can show a clear "not configured" message rather than crashing.
// SUPABASE_SERVICE_ROLE_KEY is documented as a placeholder in
// .env.local.example — the user must paste a real key into .env.local
// themselves before admin operations (inviting staff) will work.
let cached: SupabaseClient<Database> | null = null;

export function getSupabaseAdmin(): SupabaseClient<Database> | null {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;

  if (!cached) {
    const { url } = supabaseEnv();
    cached = createClient<Database>(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return cached;
}
