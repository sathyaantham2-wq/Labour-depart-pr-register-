"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DownloadIcon, FileIcon, FileImageIcon, FileSpreadsheetIcon, FileTextIcon, LoaderIcon, Trash2Icon, UploadCloudIcon } from "lucide-react";
import { cn } from "cn";
import {
  deleteDocument,
  getDocumentUrl,
  prepareDocumentUpload,
  recordDocument,
} from "@/app/(app)/cases/[id]/documents-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateIST } from "@/lib/format-date";
import { createClient } from "@/lib/supabase/client";
import { DOCUMENT_ACCEPT, formatBytes, isAllowedDocumentType, MAX_DOCUMENT_BYTES } from "./document-rules";

export type CaseDocument = {
  id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
  uploaded_by: string | null;
};

function DocIcon({ type }: { type: string }) {
  const Icon = type.startsWith("image/")
    ? FileImageIcon
    : type.includes("sheet") || type.includes("excel")
      ? FileSpreadsheetIcon
      : type === "application/pdf" || type.includes("word")
        ? FileTextIcon
        : FileIcon;
  return <Icon className="size-5 shrink-0 text-primary" />;
}

export function DocumentsSection({
  caseId,
  documents,
  currentUserId,
  isAdmin,
}: {
  caseId: string;
  documents: CaseDocument[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function uploadOne(file: File): Promise<boolean> {
    if (!isAllowedDocumentType(file.type)) {
      toast.error(`${file.name}: upload a PDF, image, Word or Excel file.`);
      return false;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      toast.error(`${file.name}: files must be 20 MB or smaller.`);
      return false;
    }
    const prepared = await prepareDocumentUpload({
      case_id: caseId,
      file_name: file.name,
      content_type: file.type,
      size_bytes: file.size,
    });
    if (!prepared.ok) {
      toast.error(`${file.name}: ${prepared.error}`);
      return false;
    }
    const { error } = await createClient()
      .storage.from("case-documents")
      .uploadToSignedUrl(prepared.path, prepared.token, file, { contentType: file.type });
    if (error) {
      toast.error(`${file.name}: upload failed. Please try again.`);
      return false;
    }
    const recorded = await recordDocument({ case_id: caseId, path: prepared.path, file_name: file.name });
    if (!recorded.ok) {
      toast.error(`${file.name}: ${recorded.error}`);
      return false;
    }
    return true;
  }

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    setUploading(list.map((f) => f.name));
    let ok = 0;
    for (const file of list) {
      if (await uploadOne(file)) ok += 1;
      setUploading((u) => u.filter((n) => n !== file.name));
    }
    if (ok) toast.success(`${ok} document${ok === 1 ? "" : "s"} uploaded.`);
    if (inputRef.current) inputRef.current.value = "";
    startTransition(() => router.refresh());
  }

  async function open(doc: CaseDocument) {
    setBusyId(doc.id);
    const result = await getDocumentUrl(doc.id);
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    window.location.assign(result.url);
  }

  async function remove(doc: CaseDocument) {
    if (!window.confirm(`Remove "${doc.file_name}"? This can't be undone.`)) return;
    setBusyId(doc.id);
    const result = await deleteDocument(doc.id, caseId);
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Document removed.");
    startTransition(() => router.refresh());
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents</CardTitle>
        <CardDescription>Complaint letters, settlement memos and scans for this entry. PDF, images, Word or Excel, up to 20 MB each.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void uploadFiles(e.dataTransfer.files);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/50",
          )}
        >
          <UploadCloudIcon className="size-7 text-muted-foreground" />
          <span className="text-sm">
            <span className="font-medium text-primary">Choose files</span> or drag them here
          </span>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={DOCUMENT_ACCEPT}
            className="sr-only"
            onChange={(e) => e.target.files && void uploadFiles(e.target.files)}
          />
        </label>

        {uploading.length > 0 && (
          <ul className="grid gap-1 text-sm text-muted-foreground" aria-live="polite">
            {uploading.map((name) => (
              <li key={name} className="flex items-center gap-2">
                <LoaderIcon className="size-4 animate-spin" /> Uploading {name}…
              </li>
            ))}
          </ul>
        )}

        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents yet.</p>
        ) : (
          <ul className="grid divide-y rounded-lg border">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center gap-3 px-3 py-2.5">
                <DocIcon type={doc.content_type} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={doc.file_name}>
                    {doc.file_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(doc.size_bytes)} · added {formatDateIST(doc.created_at)}
                  </p>
                </div>
                <Button type="button" variant="ghost" size="sm" disabled={busyId === doc.id} onClick={() => open(doc)}>
                  <DownloadIcon data-icon="inline-start" /> Open
                </Button>
                {(isAdmin || doc.uploaded_by === currentUserId) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${doc.file_name}`}
                    disabled={busyId === doc.id}
                    onClick={() => remove(doc)}
                  >
                    <Trash2Icon className="text-destructive" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
