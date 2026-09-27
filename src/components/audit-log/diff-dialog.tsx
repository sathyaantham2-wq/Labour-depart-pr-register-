"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Json } from "@/types/database";

export function AuditDiffDialog({
  tableName,
  action,
  timestampLabel,
  changedByLabel,
  diff,
}: {
  tableName: string;
  action: string;
  timestampLabel: string;
  changedByLabel: string;
  diff: Json;
}) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>View diff</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {tableName} — {action}
          </DialogTitle>
          <DialogDescription>
            {timestampLabel} · {changedByLabel}
          </DialogDescription>
        </DialogHeader>
        <pre className="max-h-[60vh] overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap break-all">
          {JSON.stringify(diff, null, 2)}
        </pre>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
