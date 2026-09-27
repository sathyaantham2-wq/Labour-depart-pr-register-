"use client";

import { Button } from "@/components/ui/button";

type Row = Record<string, unknown>;

function escapeCsvValue(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function toCsv(rows: Row[]): string {
  if (rows.length === 0) return "";
  const columns = Object.keys(rows[0]);
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((col) => escapeCsvValue(row[col])).join(","));
  }
  return lines.join("\n");
}

// Builds the CSV client-side from the rows already fetched by the server
// component (no dedicated export endpoint needed) and triggers a download
// via a Blob object URL.
export function CsvExportButton({ rows, filename }: { rows: Row[]; filename: string }) {
  function handleExport() {
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleExport}>
      Export CSV
    </Button>
  );
}
