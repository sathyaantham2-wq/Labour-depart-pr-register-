"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDaysIcon, FileTextIcon, FolderKanbanIcon, PlusIcon, SearchIcon } from "lucide-react";
import { cn } from "cn";
import { searchEntries, type SearchResult } from "@/app/(app)/search-actions";
import { CaseStatusBadge } from "@/components/cases/status-badge";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

type Item =
  | { kind: "result"; href: string; result: SearchResult }
  | { kind: "link"; href: string; label: string; icon: typeof PlusIcon };

const QUICK_LINKS: Item[] = [
  { kind: "link", href: "/cases/new", label: "New Entry", icon: PlusIcon },
  { kind: "link", href: "/hearings", label: "Today's hearings", icon: CalendarDaysIcon },
  { kind: "link", href: "/cases", label: "All current entries", icon: FolderKanbanIcon },
];

export function CommandSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const [pending, startTransition] = useTransition();
  const latest = useRef("");

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing = target?.closest("input, textarea, select, [contenteditable=true]");
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const q = query.trim();
    latest.current = q;
    if (q.length < 2) return;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const found = await searchEntries(q);
        if (latest.current === q) {
          setResults(found);
          setActive(0);
        }
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const showResults = query.trim().length >= 2;
  const items: Item[] = showResults
    ? results.map((r) => ({ kind: "result", href: `/cases/${r.id}`, result: r }))
    : QUICK_LINKS;

  function go(item: Item | undefined) {
    if (!item) return;
    setOpen(false);
    router.push(item.href);
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery("");
      setResults([]);
      setActive(0);
    }
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(items[active]);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 w-full max-w-xs items-center gap-2 rounded-lg border bg-card px-2.5 text-sm text-muted-foreground shadow-elevation-1 transition-colors hover:bg-muted sm:w-64"
      >
        <SearchIcon className="size-4 shrink-0" />
        <span className="flex-1 truncate text-left">Search entries…</span>
        <kbd className="hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">Ctrl K</kbd>
      </button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="top-[15%] translate-y-0 gap-0 p-0 sm:max-w-xl" showCloseButton={false}>
          <DialogTitle className="sr-only">Search entries</DialogTitle>
          <DialogDescription className="sr-only">
            Search by file number, memo number, subject, party name, email or phone number.
          </DialogDescription>
          <div className="flex items-center gap-2 border-b px-3">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="File number, name, company, memo, phone…"
              aria-label="Search entries"
              role="combobox"
              aria-expanded
              aria-controls="command-search-list"
              aria-activedescendant={items[active] ? `command-item-${active}` : undefined}
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {pending && <span className="text-xs text-muted-foreground">Searching…</span>}
          </div>

          <ul id="command-search-list" role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
            {!showResults && <li className="px-2 pt-1 pb-2 text-xs font-medium text-muted-foreground">Quick links</li>}
            {showResults && !pending && results.length === 0 && (
              <li className="px-3 py-8 text-center text-sm text-muted-foreground">No entries match “{query.trim()}”.</li>
            )}
            {items.map((item, i) => (
              <li
                key={item.href}
                id={`command-item-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseMove={() => setActive(i)}
                onClick={() => go(item)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm",
                  i === active && "bg-accent text-accent-foreground",
                )}
              >
                {item.kind === "link" ? (
                  <>
                    <item.icon className="size-4 text-muted-foreground" />
                    {item.label}
                  </>
                ) : (
                  <>
                    <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.result.file_number}</span>
                        <CaseStatusBadge status={item.result.status} />
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {[item.result.applicant, item.result.management].filter(Boolean).join(" vs ") ||
                          item.result.subject ||
                          "—"}
                      </div>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
          <div className="flex gap-3 border-t px-3 py-2 text-[11px] text-muted-foreground">
            <span>↑↓ to move</span>
            <span>Enter to open</span>
            <span>Esc to close</span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
