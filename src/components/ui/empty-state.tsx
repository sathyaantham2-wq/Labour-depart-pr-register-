import type { ReactNode } from "react";
import { InboxIcon } from "lucide-react";
import { cn } from "cn";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-4 py-12 text-center", className)}>
      <div className="flex size-12 items-center justify-center rounded-2xl bg-muted shadow-elevation-1">
        <InboxIcon className="size-5 text-muted-foreground" />
      </div>
      <div className="grid gap-1">
        <p className="font-heading text-sm font-semibold">{title}</p>
        {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
