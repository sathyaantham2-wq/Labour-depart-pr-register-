"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NOTICE_TYPES, LANGUAGES } from "@/components/notice-templates/constants";
import { getSupabaseAdmin } from "@/lib/server/supabase-admin";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";

export type TemplateActionState = { error?: string; message?: string };

// Notices bucket is private with zero storage.objects RLS policies (see
// supabase/migrations/20260927100800_storage_notices.sql) — only a service-role client can
// read/write it, so uploads must go through getSupabaseAdmin() after an admin check done with
// the normal signed-in-user client, mirroring the pattern in src/app/api/notices/route.ts.
const NOTICES_BUCKET = "notices";

// UI-only convenience check — RLS on public.notice_templates is the real guard (admin-only
// insert/update/delete; see supabase/migrations/20260927100600_notices_rls.sql).
async function assertAdmin(): Promise<string | null> {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    return "Only admins can manage notice templates.";
  }
  return null;
}

const uploadSchema = z.object({
  name: z.string().trim().min(1, "Enter a template name.").max(200),
  notice_type: z.enum(NOTICE_TYPES, { message: "Choose a notice type." }),
  language: z.enum(LANGUAGES, { message: "Choose a language." }),
  whatsapp_template_name: z.string().trim().max(200).optional(),
});

export type UploadTemplateInput = {
  name: string;
  notice_type: string;
  language: string;
  whatsapp_template_name: string;
  file: File;
};

export async function uploadTemplate(input: UploadTemplateInput): Promise<TemplateActionState> {
  const denied = await assertAdmin();
  if (denied) return { error: denied };

  const parsed = uploadSchema.safeParse({
    name: input.name,
    notice_type: input.notice_type,
    language: input.language,
    whatsapp_template_name: input.whatsapp_template_name,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid template." };

  if (!(input.file instanceof File) || input.file.size === 0) {
    return { error: "Choose a .docx file to upload." };
  }
  if (!input.file.name.toLowerCase().endsWith(".docx")) {
    return { error: "Only .docx files are accepted." };
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return { error: "Template upload is not configured: SUPABASE_SERVICE_ROLE_KEY is not set." };
  }

  const docPath = `templates/${randomUUID()}.docx`;
  const buffer = Buffer.from(await input.file.arrayBuffer());
  const { error: uploadError } = await admin.storage.from(NOTICES_BUCKET).upload(docPath, buffer, {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    upsert: false,
  });
  if (uploadError) {
    console.error("uploadTemplate: storage upload failed", uploadError);
    return { error: "Could not upload the template file. Please try again." };
  }

  const supabase = await createClient();
  const { error: insertError } = await supabase.from("notice_templates").insert({
    name: parsed.data.name,
    notice_type: parsed.data.notice_type,
    language: parsed.data.language,
    docx_path: docPath,
    whatsapp_template_name: parsed.data.whatsapp_template_name || null,
  });
  if (insertError) {
    console.error("uploadTemplate: insert failed", insertError);
    // Best-effort cleanup so we don't leave an orphaned file with no DB row.
    await admin.storage.from(NOTICES_BUCKET).remove([docPath]);
    return { error: "Could not save the template record. Please try again." };
  }

  revalidatePath("/notice-templates");
  return { message: `Template "${parsed.data.name}" uploaded.` };
}

const toggleSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean(),
});

export async function setTemplateActive(input: { id: string; active: boolean }): Promise<TemplateActionState> {
  const denied = await assertAdmin();
  if (denied) return { error: denied };

  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid request." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("notice_templates")
    .update({ active: parsed.data.active })
    .eq("id", parsed.data.id);
  if (error) {
    console.error("setTemplateActive: update failed", error);
    return { error: "Could not update the template. Please try again." };
  }

  revalidatePath("/notice-templates");
  return { message: parsed.data.active ? "Template activated." : "Template deactivated." };
}

const whatsappSchema = z.object({
  id: z.string().uuid(),
  whatsapp_template_name: z.string().trim().max(200).optional(),
});

export async function updateTemplateWhatsapp(input: {
  id: string;
  whatsapp_template_name: string;
}): Promise<TemplateActionState> {
  const denied = await assertAdmin();
  if (denied) return { error: denied };

  const parsed = whatsappSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid request." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("notice_templates")
    .update({ whatsapp_template_name: parsed.data.whatsapp_template_name || null })
    .eq("id", parsed.data.id);
  if (error) {
    console.error("updateTemplateWhatsapp: update failed", error);
    return { error: "Could not update the template. Please try again." };
  }

  revalidatePath("/notice-templates");
  return { message: "WhatsApp template name updated." };
}
