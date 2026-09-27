import type { Metadata } from "next";
import { TemplateManager } from "@/components/notice-templates/template-manager";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Notice Templates" };

export default async function NoticeTemplatesPage() {
  const supabase = await createClient();
  const [profile, { data: templates, error }] = await Promise.all([
    getCurrentProfile(),
    supabase
      .from("notice_templates")
      .select("id, name, notice_type, language, active, whatsapp_template_name")
      .order("notice_type")
      .order("language"),
  ]);

  const isAdmin = profile?.role === "admin";

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Notice Templates</h1>
        <p className="text-muted-foreground">
          DOCX templates used to generate hearing, show-cause, closure and order notices.
          {isAdmin
            ? " Admins can upload new templates and control which ones are active."
            : " Only active templates are shown; ask an admin to add or change one."}
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load notice templates. Please try again.
        </p>
      ) : (
        <TemplateManager templates={templates ?? []} isAdmin={isAdmin} />
      )}
    </div>
  );
}
