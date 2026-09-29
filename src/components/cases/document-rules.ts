// Shared between the upload widget (instant feedback) and the server action (enforcement).
// Must stay in line with the case-documents bucket's allowed_mime_types / file_size_limit
// (supabase/migrations/20260929090000_case_documents.sql).
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export const DOCUMENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
] as const;

export const DOCUMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx";

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isAllowedDocumentType(type: string): type is (typeof DOCUMENT_TYPES)[number] {
  return (DOCUMENT_TYPES as readonly string[]).includes(type);
}
