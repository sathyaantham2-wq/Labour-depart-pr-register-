export type NavItem = { href: string; label: string };

// Plain data only: these are passed from the Server Component app shell into the
// SidebarNav Client Component, so they must stay serializable (no icon components).
export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/cases", label: "Current Entries" },
];

// Admin-only screens (RBAC Matrix tab). Hidden for staff; RLS also blocks
// writes at the database level regardless of what the UI shows.
export const ADMIN_NAV: NavItem[] = [
  { href: "/sections", label: "Sections" },
  { href: "/received-from", label: "Received From" },
  { href: "/staff", label: "Staff" },
  { href: "/mis", label: "Monthly MIS" },
  { href: "/notice-templates", label: "Notice Templates" },
  { href: "/audit-log", label: "Audit Log" },
  { href: "/data-import", label: "Data Import" },
];
