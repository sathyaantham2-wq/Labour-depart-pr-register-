import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Notice = Database["public"]["Tables"]["notices"]["Row"];

// Idempotency scheme (see notices.idempotency_key, unique):
//
//   clientKey                          -- if the caller supplied one, use it verbatim
//   hearingId                          -- if the notice is tied to a hearing
//   `case:${caseId}:${noticeType}`     -- otherwise (show_cause / closure / order, or a
//                                          hearing-type notice requested before any hearing
//                                          exists for the case)
//
// hearing_id alone is enough to dedupe globally (it's a UUID, unique across every case), which
// matches the Automation tab's "idempotency_key = hearing_id + notice_type" note and guarantees
// Scenario 1 (Immediate Notify) and Scenario 2 (Batch/Scheduled Notify) can never double-notify
// the same hearing. When there's no hearing_id we fall back to case_id + notice_type so two
// different cases both generating (say) a hearing-less "closure" notice don't collide with each
// other under the literal string "none:closure". This does mean a second "closure" notice for the
// same case reuses the first one's row unless the caller passes an explicit clientKey to force a
// fresh notice (e.g. re-issuing after a correction) — that's intentional: silently generating
// unlimited duplicate closure notices for one case is the failure mode this scheme exists to
// prevent, so overriding it is opt-in via clientKey, not the default.
export function buildIdempotencyKey(input: {
  caseId: string;
  hearingId: string | null;
  noticeType: string;
  clientKey?: string | null;
}): string {
  const trimmedClientKey = input.clientKey?.trim();
  if (trimmedClientKey) return trimmedClientKey;

  const scope = input.hearingId ?? `case:${input.caseId}`;
  return `${scope}:${input.noticeType}`;
}

// Looks up an existing notice by idempotency key. Returns null if none exists.
// Callers should use a client with the appropriate privileges: the notices
// route uses the service-role client here (it also does the insert with it),
// since RLS grants authenticated users select-via-case-access, and this
// lookup runs after that access has already been confirmed separately.
export async function findNoticeByIdempotencyKey(
  supabase: SupabaseClient<Database>,
  idempotencyKey: string,
): Promise<Notice | null> {
  const { data, error } = await supabase
    .from("notices")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (error) throw error;
  return data;
}
