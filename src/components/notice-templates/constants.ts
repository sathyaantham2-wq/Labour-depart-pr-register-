// Keep in sync with the CHECK constraint on public.notice_templates.notice_type
// (supabase/migrations/20260927100400_notices_schema.sql) and the labels used in
// src/lib/notices/email.ts (NOTICE_TYPE_BODY).
export const NOTICE_TYPES = ["hearing", "show_cause", "closure", "order"] as const;
export type NoticeType = (typeof NOTICE_TYPES)[number];

export const NOTICE_TYPE_LABELS: Record<NoticeType, string> = {
  hearing: "Hearing Notice",
  show_cause: "Show Cause Notice",
  closure: "Closure Notice",
  order: "Order",
};

export function noticeTypeLabel(value: string): string {
  return NOTICE_TYPE_LABELS[value as NoticeType] ?? value;
}

export const LANGUAGES = ["en", "te"] as const;
export type TemplateLanguage = (typeof LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<TemplateLanguage, string> = {
  en: "English",
  te: "Telugu",
};

export function languageLabel(value: string): string {
  return LANGUAGE_LABELS[value as TemplateLanguage] ?? value;
}

// Every placeholder buildNoticeTemplateData() (src/lib/notices/render.ts) can fill in. A
// template only needs to use the ones relevant to it — unused ones are simply never
// referenced, and referencing one this list doesn't cover will fail to render (422 with
// missingPlaceholders) rather than silently printing blank text.
export const TEMPLATE_PLACEHOLDERS = [
  "file_number",
  "subject",
  "act",
  "office_code",
  "received_date",
  "memo_number",
  "next_hearing_date",
  "hearing_date",
  "hearing_time",
  "applicant_name",
  "applicant_address",
  "applicant_email",
  "applicant_phone",
  "applicant_whatsapp_phone",
  "management_name",
  "management_address",
  "management_email",
  "management_phone",
  "management_whatsapp_phone",
  "today_date",
] as const;
