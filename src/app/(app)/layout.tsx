import { redirect } from "next/navigation";
import { ScaleIcon, LogOutIcon } from "lucide-react";
import { ChatWidget } from "@/components/chatbot/chat-widget";
import { ADMIN_NAV, NAV } from "@/components/layout/nav-items";
import { CommandSearch } from "@/components/layout/command-search";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { Button } from "@/components/ui/button";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { getCurrentUser } from "@/lib/supabase/server";

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
      <aside className="flex flex-col print:hidden border-b border-sidebar-border bg-sidebar-gradient text-sidebar-foreground shadow-elevation-3 md:z-20 md:w-64 md:border-b-0 md:border-r">
        <div className="flex items-center gap-2.5 px-4 py-5">
          <div className="tile-3d flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[oklch(0.72_0.2_300)] via-[oklch(0.6_0.23_280)] to-[oklch(0.66_0.16_215)] [--tile-glow:oklch(0.62_0.22_285/0.55)]">
            <ScaleIcon className="size-5 text-white drop-shadow" />
          </div>
          <div className="leading-tight">
            <div className="font-heading text-sm font-semibold tracking-tight">Labour Case Register</div>
            <div className="text-xs text-sidebar-foreground/50">Telangana Labour Department</div>
          </div>
        </div>
        <SidebarNav items={nav} />
      </aside>

      <div className="flex flex-1 flex-col bg-ambient">
        <header className="sticky top-0 z-30 flex print:hidden items-center gap-3 border-b bg-card/75 px-4 py-2.5 text-sm shadow-elevation-1 backdrop-blur-md">
          <CommandSearch />
          <div className="ml-auto hidden items-center gap-2 rounded-full bg-muted py-1 pr-3 pl-1 md:flex">
            <div className="flex size-6 items-center justify-center rounded-full bg-gradient-to-br from-vivid-violet to-primary text-[10px] font-semibold text-primary-foreground shadow-elevation-1">
              {initials}
            </div>
            <span className="truncate text-muted-foreground">{user.email}</span>
          </div>
          <form action="/auth/signout" method="post" className="ml-auto md:ml-0">
            <Button type="submit" variant="outline" size="sm">
              <LogOutIcon data-icon="inline-start" />
              Sign out
            </Button>
          </form>
        </header>
        <main className="flex-1 p-4 md:p-6 print:p-0">{children}</main>
        <ChatWidget />
      </div>
    </div>
  );
}
