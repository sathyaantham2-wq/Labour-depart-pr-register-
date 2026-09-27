import { Badge } from "@/components/ui/badge";
import {
  CASE_STATUS_LABELS,
  HEARING_STATUS_LABELS,
  type CaseStatus,
  type HearingStatus,
} from "./constants";

export function CaseStatusBadge({ status }: { status: string }) {
  const variant = status === "open" ? "default" : status === "closed" ? "secondary" : "outline";
  const label = CASE_STATUS_LABELS[status as CaseStatus] ?? status;
  return <Badge variant={variant}>{label}</Badge>;
}

export function HearingStatusBadge({ status }: { status: string }) {
  const variant =
    status === "scheduled"
      ? "default"
      : status === "held"
        ? "secondary"
        : status === "cancelled"
          ? "destructive"
          : "outline";
  const label = HEARING_STATUS_LABELS[status as HearingStatus] ?? status;
  return <Badge variant={variant}>{label}</Badge>;
}
