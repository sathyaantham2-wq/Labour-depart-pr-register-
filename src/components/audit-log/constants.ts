// Tables audited by the `audit_row()` trigger (see
// supabase/migrations/20260927100100_triggers.sql and ..._100500_notices_triggers.sql).
export const AUDIT_TABLES = [
  "cases",
  "parties",
  "hearings",
  "remarks",
  "profiles",
  "sections",
  "received_from",
  "notices",
] as const;

export const AUDIT_ACTIONS = ["insert", "update", "delete"] as const;

export function isAuditTable(value: string | undefined): value is (typeof AUDIT_TABLES)[number] {
  return !!value && (AUDIT_TABLES as readonly string[]).includes(value);
}

export function isAuditAction(value: string | undefined): value is (typeof AUDIT_ACTIONS)[number] {
  return !!value && (AUDIT_ACTIONS as readonly string[]).includes(value);
}
