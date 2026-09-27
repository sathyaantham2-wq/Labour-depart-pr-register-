import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Print Notice" };

// Placeholder screen. Notice generation (DOCX templates, storage, Email/WhatsApp
// delivery via Make.com) is being built by the notice-api-engineer / automation-engineer
// agents in a separate track — this route just reserves the link from Case Details.
export default async function NoticePage({ params }: PageProps<"/cases/[id]/notice">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: caseRow } = await supabase.from("cases").select("id, file_number").eq("id", id).maybeSingle();
  if (!caseRow) notFound();

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Print Notice / Download DOCX</h1>
        <p className="text-muted-foreground">File Number: {caseRow.file_number}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Coming in the next phase</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            Notice generation (DOCX templates, preview, and Email / WhatsApp delivery) is being
            built separately and will appear here.
          </p>
          <Link href={`/cases/${id}`} className={buttonVariants({ variant: "outline" })}>
            Back to case
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
