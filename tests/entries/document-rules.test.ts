import { describe, expect, it } from "vitest";
import { DOCUMENT_ACCEPT, formatBytes, isAllowedDocumentType, MAX_DOCUMENT_BYTES } from "@/components/cases/document-rules";

describe("document rules", () => {
  it("allows office document types and rejects executables", () => {
    expect(isAllowedDocumentType("application/pdf")).toBe(true);
    expect(isAllowedDocumentType("image/jpeg")).toBe(true);
    expect(isAllowedDocumentType("application/x-msdownload")).toBe(false);
    expect(isAllowedDocumentType("text/html")).toBe(false);
  });
  it("matches the storage bucket's 20 MB limit", () => {
    expect(MAX_DOCUMENT_BYTES).toBe(20971520);
  });
  it("offers matching extensions in the file picker", () => {
    for (const ext of [".pdf", ".jpg", ".png", ".docx", ".xlsx"]) expect(DOCUMENT_ACCEPT).toContain(ext);
  });
  it("formats sizes for people", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("app and database agree on allowed document types", () => {
  it("DOCUMENT_TYPES equals the bucket's allowed_mime_types", async () => {
    const { readFileSync } = await import("node:fs");
    const { DOCUMENT_TYPES } = await import("@/components/cases/document-rules");
    const sql = readFileSync("supabase/migrations/20260929090000_case_documents.sql", "utf8");
    const bucketTypes = [...sql.slice(sql.indexOf("array[")).matchAll(/'([a-z]+\/[^']+)'/g)].map((m) => m[1]);
    expect([...bucketTypes].sort()).toEqual([...DOCUMENT_TYPES].sort());
  });
});
