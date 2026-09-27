// Shared enums/labels for the Case Management screens (Data Model + Screens tabs).
// Kept in one place so filters, forms and badges never drift from the DB check
// constraints in supabase/migrations/20260927100000_core_schema.sql.

export const CASE_STATUSES = ["open", "closed", "forwarded"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  open: "Open",
  closed: "Closed",
  forwarded: "Forwarded",
};

export const HEARING_STATUSES = ["scheduled", "held", "adjourned", "cancelled"] as const;
export type HearingStatus = (typeof HEARING_STATUSES)[number];

export const HEARING_STATUS_LABELS: Record<HearingStatus, string> = {
  scheduled: "Scheduled",
  held: "Held",
  adjourned: "Adjourned",
  cancelled: "Cancelled",
};

export const PARTY_ROLES = ["applicant", "management"] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];

export const PARTY_ROLE_LABELS: Record<PartyRole, string> = {
  applicant: "Applicant",
  management: "Management",
};

export function isCaseStatus(value: string | undefined | null): value is CaseStatus {
  return !!value && (CASE_STATUSES as readonly string[]).includes(value);
}
