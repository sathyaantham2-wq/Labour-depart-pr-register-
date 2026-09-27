import { Badge } from "@/components/ui/badge";

const ACTION_LABELS: Record<string, string> = {
  insert: "Insert",
  update: "Update",
  delete: "Delete",
};

// insert = green-ish, update = blue-ish, delete = red-ish (via Badge's outline
// variant + accent colors, since Badge has no built-in success/info variant).
export function AuditActionBadge({ action }: { action: string }) {
  const label = ACTION_LABELS[action] ?? action;

  if (action === "insert") {
    return (
      <Badge
        variant="outline"
        className="border-green-600/30 bg-green-600/10 text-green-700 dark:border-green-400/30 dark:bg-green-400/10 dark:text-green-400"
      >
        {label}
      </Badge>
    );
  }

  if (action === "update") {
    return (
      <Badge
        variant="outline"
        className="border-blue-600/30 bg-blue-600/10 text-blue-700 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-400"
      >
        {label}
      </Badge>
    );
  }

  if (action === "delete") {
    return <Badge variant="destructive">{label}</Badge>;
  }

  return <Badge variant="secondary">{label}</Badge>;
}
