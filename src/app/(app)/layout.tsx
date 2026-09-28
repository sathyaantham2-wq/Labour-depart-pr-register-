import { redirect } from "next/navigation";
import { ScaleIcon, LogOutIcon } from "lucide-react";
import { type NavItem, SidebarNav } from "@/components/layout/sidebar-nav";
import { Button } from "@/components/ui/button";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { getCurrentUser } from "@/lib/supabase/server";

// Screens are added here as they are built (see Screens tab of the plan).
// Icons are looked up client-side in SidebarNav, keyed by href — a Server
// Component can't pass icon component references as props to a Client
// Component (React can't serialize functions across that boundary).
const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/cases", label: "Current Entries" },
];

// Admin-only screens (RBAC Matrix tab). Hidden for staff; RLS also blocks
// writes at the database level regardless of what the UI shows.
const ADMIN_NAV: NavItem[] = [
  { href: "/sections", label: "Sections" },
  { href: "/received-from", label: "Received From" },
  { href: "/staff", label: "Staff" },
  { href: "/mis", label: "Monthly MIS" },
  { href: "/notice-templates", label: "Notice Templates" },
  { href: "/audit-log", label: "Audit Log" },
  { href: "/data-import", label: "Data Import" },
];

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const profile = await getCurrentProfile();
  const nav = profile?.role === "admin" ? [...NAV, ...ADMIN_NAV] : NAV;
  const initials = (profile?.full_name || user.email || "?")
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="flex flex-col border-b border-sidebar-border bg-sidebar text-sidebar-foreground md:w-64 md:border-b-0 md:border-r">
        <div className="flex items-center gap-2.5 px-4 py-5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sidebar-primary to-[color-mix(in_oklch,var(--sidebar-primary),black_25%)] shadow-glow-primary">
            <ScaleIcon className="size-4.5 text-sidebar-primary-foreground" />
          </div>
          <div className="leading-tight">
            <div className="font-heading text-sm font-semibold tracking-tight">Labour Case Register</div>
            <div className="text-xs text-sidebar-foreground/50">Telangana Labour Department</div>
          </div>
        </div>
        <SidebarNav items={nav} />
      </aside>

      <div className="flex flex-1 flex-col bg-ambient">
        <header className="flex items-center justify-end gap-3 border-b bg-card/80 px-4 py-2.5 text-sm shadow-elevation-1 backdrop-blur-sm">
          <div className="flex items-center gap-2 rounded-full bg-muted py-1 pr-3 pl-1">
            <div className="flex size-6 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {initials}
            </div>
            <span className="truncate text-muted-foreground">{user.email}</span>
          </div>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="outline" size="sm">
              <LogOutIcon data-icon="inline-start" />
              Sign out
            </Button>
          </form>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
