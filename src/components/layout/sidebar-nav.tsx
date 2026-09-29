"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboardIcon,
  FolderKanbanIcon,
  CalendarDaysIcon,
  ListTreeIcon,
  InboxIcon,
  UsersIcon,
  BarChart3Icon,
  FileTextIcon,
  ScrollTextIcon,
  UploadIcon,
  CircleIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import type { NavItem } from "./nav-items";

// Icon components can't cross the server/client boundary as props (React
// Server Components can't serialize function references), so the lookup
// lives entirely inside this client module, keyed by href.
export const NAV_ICONS: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboardIcon,
  "/cases": FolderKanbanIcon,
  "/hearings": CalendarDaysIcon,
  "/sections": ListTreeIcon,
  "/received-from": InboxIcon,
  "/staff": UsersIcon,
  "/mis": BarChart3Icon,
  "/notice-templates": FileTextIcon,
  "/audit-log": ScrollTextIcon,
  "/data-import": UploadIcon,
};

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:gap-0.5 md:pb-0">
      {items.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
        const Icon = NAV_ICONS[item.href] ?? CircleIcon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "group flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-all",
              active
                ? "btn-3d bg-gradient-to-b from-[color-mix(in_oklch,var(--sidebar-primary),white_18%)] to-sidebar-primary text-sidebar-primary-foreground [--btn-edge:var(--sidebar-primary)] [--btn-glow:oklch(0.62_0.22_285/0.5)]"
                : "text-sidebar-foreground/75 hover:translate-x-0.5 hover:bg-white/10 hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon
              className={cn(
                "size-4 shrink-0 transition-colors",
                active ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/50 group-hover:text-sidebar-accent-foreground",
              )}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
