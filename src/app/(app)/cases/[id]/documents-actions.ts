"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DOCUMENT_TYPES, MAX_DOCUMENT_BYTES } from "@/components/cases/document-rules";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "case-documents";
const DOWNLOAD_URL_TTL_SECONDS = 60;

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const NOT_CONFIGURED = "Document storage isn't configured on the server yet (service key missing).";

function safeFileName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .slice(-120);
  return cleaned || "document";
}

async function canAccessCase(caseId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("cases").select("id").eq("id", caseId).is("deleted_at", null).maybeSingle();
  return !!data;
}

const prepareSchema = z.object({
  case_id: z.string().uuid(),
  file_name: z.string().trim().min(1).max(255),
  content_type: z.enum(DOCUMENT_TYPES),
  size_bytes: z.number().int().positive().max(MAX_DOCUMENT_BYTES, "Files must be 20 MB or smaller."),
});

// Step 1: check access, then mint a one-time signed upload URL so the browser sends the file
// straight to Storage (large scans would exceed the serverless request-body limit otherwise).
export async function prepareDocumentUpload(
  input: z.input<typeof prepareSchema>,
): Promise<Result<{ path: string; token: string }>> {
  const parsed = prepareSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.path[0] === "content_type" ? "Upload a PDF, image, Word or Excel file." : (issue?.message ?? "Invalid file."),
    };
  }
  if (!(await canAccessCase(parsed.data.case_id))) return { ok: false, error: "Entry not found, or you don't have access." };

  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, error: NOT_CONFIGURED };

  const path = `cases/${parsed.data.case_id}/${randomUUID()}-${safeFileName(parsed.data.file_name)}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("prepareDocumentUpload: could not create upload URL", error);
    return { ok: false, error: "Could not start the upload. Please try again." };
  }
  return { ok: true, path: data.path, token: data.token };
}

const recordSchema = z.object({
  case_id: z.string().uuid(),
  path: z.string().min(1),
  file_name: z.string().trim().min(1).max(255),
});

// Step 2: after the browser upload succeeds, verify the object really exists (using Storage's
// own size/type, not the client's claim) and record it — the insert runs under the caller's
// RLS, which is the final authority on whether they may attach documents to this entry.
export async function recordDocument(input: z.input<typeof recordSchema>): Promise<Result> {
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid upload." };
  const { case_id, path, file_name } = parsed.data;
  if (!path.startsWith(`cases/${case_id}/`)) return { ok: false, error: "Invalid upload." };

  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, error: NOT_CONFIGURED };

  const { data: info, error: infoError } = await admin.storage.from(BUCKET).info(path);
  if (infoError || !info) return { ok: false, error: "The upload didn't complete. Please try again." };

  const supabase = await createClient();
  const { error } = await supabase.from("case_documents").insert({
    case_id,
    file_name: file_name.slice(0, 255),
    storage_path: path,
    content_type: info.contentType ?? "application/octet-stream",
    size_bytes: info.size ?? 0,
  });
  if (error) {
    await admin.storage.from(BUCKET).remove([path]);
    console.error("recordDocument: insert failed", error);
    return { ok: false, error: "Could not save the document. Please try again." };
  }

  revalidatePath(`/cases/${case_id}`);
  return { ok: true };
}

export async function getDocumentUrl(documentId: string): Promise<Result<{ url: string }>> {
  if (!z.string().uuid().safeParse(documentId).success) return { ok: false, error: "Invalid document." };
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("case_documents")
    .select("storage_path, file_name")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return { ok: false, error: "Document not found, or you don't have access." };

  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, error: NOT_CONFIGURED };
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(doc.storage_path, DOWNLOAD_URL_TTL_SECONDS, { download: doc.file_name });
  if (error || !data) return { ok: false, error: "Could not open the document. Please try again." };
  return { ok: true, url: data.signedUrl };
}

export async function deleteDocument(documentId: string, caseId: string): Promise<Result> {
  if (!z.string().uuid().safeParse(documentId).success) return { ok: false, error: "Invalid document." };
  const supabase = await createClient();
  // RLS decides: only the uploader (with access to the entry) or an admin may delete.
  const { data: deleted, error } = await supabase
    .from("case_documents")
    .delete()
    .eq("id", documentId)
    .select("storage_path");
  if (error || !deleted?.length) return { ok: false, error: "Only the person who uploaded it, or an admin, can remove this document." };

  const admin = getSupabaseAdmin();
  if (admin) await admin.storage.from(BUCKET).remove(deleted.map((d) => d.storage_path));

  revalidatePath(`/cases/${caseId}`);
  return { ok: true };
}
