"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CASE_STATUS_LABELS } from "@/components/cases/constants";
import {
  CASE_IMPORT_FIELDS,
  IMPORT_FIELD_LABELS,
  REQUIRED_IMPORT_FIELDS,
  buildDefaultMapping,
  extractMappedRow,
  validateRows,
  type CaseImportField,
  type ValidatedRow,
} from "@/lib/data-import/mapping";
import {
  checkExistingFileNumbers,
  commitImport,
  parseImportFile,
  type CommitImportResult,
  type CommitRowInput,
} from "./actions";

type Lookup = { id: string; name: string };
type Step = "upload" | "map" | "preview" | "result";
type Mapping = Record<CaseImportField, string | null>;

const NONE_VALUE = "__none__";
const PREVIEW_LIMIT = 20;

export function ImportWizard({ sections, receivedFrom }: { sections: Lookup[]; receivedFrom: Lookup[] }) {
  const [step, setStep] = useState<Step>("upload");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [parsing, startParsing] = useTransition();

  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<unknown[][]>([]);
  const [mapping, setMapping] = useState<Mapping | null>(null);

  const [building, startBuilding] = useTransition();
  const [buildError, setBuildError] = useState<string | null>(null);
  const [validated, setValidated] = useState<ValidatedRow[] | null>(null);

  const [committing, startCommitting] = useTransition();
  const [result, setResult] = useState<CommitImportResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const validRows = useMemo(() => (validated ?? []).filter((r) => r.valid), [validated]);
  const invalidRows = useMemo(() => (validated ?? []).filter((r) => !r.valid), [validated]);

  function resetAll() {
    setStep("upload");
    setUploadError(null);
    setHeaders([]);
    setRawRows([]);
    setMapping(null);
    setBuildError(null);
    setValidated(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setUploadError("Choose a file to upload.");
      return;
    }
    const formData = new FormData();
    formData.set("file", file);
    setUploadError(null);
    startParsing(async () => {
      const res = await parseImportFile(formData);
      if (!res.ok) {
        setUploadError(res.error);
        toast.error(res.error);
        return;
      }
      setHeaders(res.headers);
      setRawRows(res.rows);
      setMapping(buildDefaultMapping(res.headers));
      setStep("map");
    });
  }

  function handleMappingChange(field: CaseImportField, header: string | null) {
    setMapping((prev) =>
      prev ? { ...prev, [field]: !header || header === NONE_VALUE ? null : header } : prev,
    );
  }

  function handleBuildPreview() {
    if (!mapping) return;
    const missingRequired = REQUIRED_IMPORT_FIELDS.filter((f) => !mapping[f]);
    if (missingRequired.length > 0) {
      const msg = `Map a column for: ${missingRequired.map((f) => IMPORT_FIELD_LABELS[f]).join(", ")}.`;
      setBuildError(msg);
      toast.error(msg);
      return;
    }

    setBuildError(null);
    startBuilding(async () => {
      const mappedRows = rawRows.map((cells, i) => extractMappedRow(headers, cells, mapping, i + 1));
      const fileNumbers = mappedRows.map((r) => r.file_number).filter(Boolean);
      const existingRes = await checkExistingFileNumbers(fileNumbers);
      if (!existingRes.ok) {
        setBuildError(existingRes.error);
        toast.error(existingRes.error);
        return;
      }

      const existingSet = new Set(existingRes.existing);
      const rows = validateRows(mappedRows, { sections, receivedFrom, existingFileNumbers: existingSet });
      setValidated(rows);
      setStep("preview");
    });
  }

  function handleConfirm() {
    const toImport: CommitRowInput[] = validRows.map((r) => ({
      rowNumber: r.rowNumber,
      file_number: r.file_number,
      act: r.act,
      received_date: r.received_date as string,
      subject: r.subject,
      memo_number: r.memo_number,
      section_id: r.section_id,
      received_from_id: r.received_from_id,
      status: r.status,
      applicant: r.applicant,
      management: r.management,
    }));

    if (toImport.length === 0) {
      toast.error("There are no valid rows to import.");
      return;
    }

    startCommitting(async () => {
      const res = await commitImport(toImport);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setResult(res);
      setStep("result");
      toast.success(`Imported ${res.importedCount} case${res.importedCount === 1 ? "" : "s"}.`);
    });
  }

  return (
    <div className="grid gap-6">
      <Steps current={step} />

      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle>1. Upload file</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleFileSubmit} className="grid gap-3 sm:max-w-md">
              <div className="grid gap-1.5">
                <Label htmlFor="import-file">Legacy case file (.xlsx or .csv)</Label>
                <Input id="import-file" type="file" accept=".xlsx,.xls,.csv" ref={fileInputRef} />
              </div>
              {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
              <div>
                <Button type="submit" disabled={parsing}>
                  {parsing ? "Reading file…" : "Upload & Continue"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {step === "map" && mapping && (
        <Card>
          <CardHeader>
            <CardTitle>2. Map columns</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <p className="text-sm text-muted-foreground">
              {rawRows.length} data row{rawRows.length === 1 ? "" : "s"} found. We guessed a mapping
              from the column headers — check it and adjust anything that&apos;s wrong.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              {CASE_IMPORT_FIELDS.map((field) => {
                const required = (REQUIRED_IMPORT_FIELDS as readonly string[]).includes(field);
                return (
                  <div key={field} className="grid gap-1.5">
                    <Label htmlFor={`map-${field}`}>
                      {IMPORT_FIELD_LABELS[field]}
                      {required && <span className="text-destructive"> *</span>}
                    </Label>
                    <Select
                      value={mapping[field] ?? NONE_VALUE}
                      onValueChange={(value) => handleMappingChange(field, value)}
                    >
                      <SelectTrigger id={`map-${field}`} className="w-full">
                        <SelectValue placeholder="Not mapped" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_VALUE}>— Not mapped —</SelectItem>
                        {headers.map((h) => (
                          <SelectItem key={h} value={h}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>

            {buildError && <p className="text-sm text-destructive">{buildError}</p>}

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={handleBuildPreview} disabled={building}>
                {building ? "Validating…" : "Continue to Preview"}
              </Button>
              <Button type="button" variant="outline" onClick={resetAll}>
                Start Over
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "preview" && validated && (
        <Card>
          <CardHeader>
            <CardTitle>3. Preview &amp; confirm</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{validRows.length} valid</Badge>
              <Badge variant={invalidRows.length > 0 ? "destructive" : "outline"}>
                {invalidRows.length} with errors (skipped)
              </Badge>
              <span className="text-muted-foreground">
                Showing first {Math.min(PREVIEW_LIMIT, validated.length)} of {validated.length} rows.
              </span>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>File No.</TableHead>
                    <TableHead>Act</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Received From</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Applicant</TableHead>
                    <TableHead>Management</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {validated.slice(0, PREVIEW_LIMIT).map((row) => (
                    <TableRow key={row.rowNumber} className={row.valid ? undefined : "bg-destructive/5"}>
                      <TableCell>{row.rowNumber}</TableCell>
                      <TableCell className="font-medium">{row.file_number || "—"}</TableCell>
                      <TableCell>{row.act || "—"}</TableCell>
                      <TableCell>{row.received_date ?? "—"}</TableCell>
                      <TableCell>
                        {row.section_id ? "Matched" : row.section_warning ? "No match" : "—"}
                      </TableCell>
                      <TableCell>
                        {row.received_from_id ? "Matched" : row.received_from_warning ? "No match" : "—"}
                      </TableCell>
                      <TableCell>{CASE_STATUS_LABELS[row.status]}</TableCell>
                      <TableCell>{row.applicant?.name ?? "—"}</TableCell>
                      <TableCell>{row.management?.name ?? "—"}</TableCell>
                      <TableCell className="max-w-64 whitespace-normal text-xs">
                        {row.valid ? (
                          [row.section_warning, row.received_from_warning].filter(Boolean).join(" ") || "—"
                        ) : (
                          <span className="text-destructive">{row.errors.join(" ")}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <p className="text-sm text-muted-foreground">
              Imported cases will be assigned to you — reassign them individually afterward if
              needed. Rows with errors above are skipped; they won&apos;t be imported.
            </p>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={handleConfirm} disabled={committing || validRows.length === 0}>
                {committing ? "Importing…" : `Confirm Import (${validRows.length})`}
              </Button>
              <Button type="button" variant="outline" onClick={resetAll}>
                Start Over
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "result" && result && result.ok && (
        <Card>
          <CardHeader>
            <CardTitle>4. Import complete</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge>{result.importedCount} imported</Badge>
              <Badge variant={result.skipped.length > 0 ? "destructive" : "outline"}>
                {result.skipped.length} skipped
              </Badge>
              {result.partyWarnings.length > 0 && (
                <Badge variant="secondary">{result.partyWarnings.length} party warnings</Badge>
              )}
            </div>

            {result.skipped.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium">Skipped rows</h3>
                <ul className="grid gap-1 text-sm text-muted-foreground">
                  {result.skipped.map((s) => (
                    <li key={s.rowNumber}>
                      Row {s.rowNumber} ({s.file_number || "no file number"}): {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.partyWarnings.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium">Party warnings</h3>
                <ul className="grid gap-1 text-sm text-muted-foreground">
                  {result.partyWarnings.map((w, i) => (
                    <li key={`${w.file_number}-${i}`}>
                      {w.file_number}: {w.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Link href="/cases" className={buttonVariants({})}>
                Go to Case List
              </Link>
              <Button type="button" variant="outline" onClick={resetAll}>
                Import Another File
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Steps({ current }: { current: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "upload", label: "Upload" },
    { key: "map", label: "Map Columns" },
    { key: "preview", label: "Preview" },
    { key: "result", label: "Result" },
  ];
  const currentIndex = steps.findIndex((s) => s.key === current);

  return (
    <ol className="flex flex-wrap gap-2 text-sm">
      {steps.map((s, i) => (
        <li key={s.key}>
          <Badge variant={i === currentIndex ? "default" : i < currentIndex ? "secondary" : "outline"}>
            {i + 1}. {s.label}
          </Badge>
        </li>
      ))}
    </ol>
  );
}
