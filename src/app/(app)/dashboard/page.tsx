import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard" };

// Placeholder until the schema exists (Roadmap Week 4: Act/Section-wise stats).
export default function DashboardPage() {
  return (
    <div className="grid gap-2">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-muted-foreground">
        Case statistics will appear here once the database schema is in place.
      </p>
    </div>
  );
}
