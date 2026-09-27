import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { NoticeGenerator } from "@/components/notices/notice-generator";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Generate Notice" };

export default async function NoticePage({ params }: PageProps<"/cases/[id]/notice">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: caseRow } = await supabase.from("cases").select("id, file_number").eq("id", id).maybeSingle();
  if (!caseRow) notFound();

  const [{ data: parties }, { data: hearings }] = await Promise.all([
    supabase.from("parties").select("id, role, name, email, whatsapp_phone").eq("case_id", id),
    supabase
      .from("hearings")
      .select("id, hearing_date, hearing_time, status")
      .eq("case_id", id)
      .order("hearing_date", { ascending: false }),
  ]);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Generate Notice</h1>
          <p className="text-muted-foreground">File Number: {caseRow.file_number}</p>
        </div>
        <Link href={`/cases/${id}`} className={buttonVariants({ variant: "outline" })}>
          Back to case
        </Link>
      </div>

      <NoticeGenerator caseId={id} parties={parties ?? []} hearings={hearings ?? []} />
    </div>
  );
}
