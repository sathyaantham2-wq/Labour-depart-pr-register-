"use client";

import { useEffect, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  setTemplateActive,
  updateTemplateWhatsapp,
  uploadTemplate,
} from "@/app/(app)/notice-templates/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  LANGUAGE_LABELS,
  LANGUAGES,
  NOTICE_TYPE_LABELS,
  NOTICE_TYPES,
  TEMPLATE_PLACEHOLDERS,
  languageLabel,
  noticeTypeLabel,
  type NoticeType,
  type TemplateLanguage,
} from "./constants";

export type NoticeTemplateRow = {
  id: string;
  name: string;
  notice_type: string;
  language: string;
  active: boolean;
  whatsapp_template_name: string | null;
};

export function TemplateManager({
  templates,
  isAdmin,
}: {
  templates: NoticeTemplateRow[];
  isAdmin: boolean;
}) {
  return (
    <div className="grid gap-6">
      {isAdmin && <UploadForm />}
      <PlaceholderReference />

      <Card>
        <CardHeader>
          <CardTitle>
            {isAdmin ? "All templates" : "Active templates"} ({templates.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {isAdmin ? "No templates yet. Upload one above." : "No active templates yet."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Language</TableHead>
                    <TableHead>WhatsApp template</TableHead>
                    <TableHead>Status</TableHead>
                    {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell>{noticeTypeLabel(t.notice_type)}</TableCell>
                      <TableCell>{languageLabel(t.language)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {t.whatsapp_template_name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={t.active ? "default" : "outline"}>
                          {t.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <EditWhatsappDialog template={t} />
                            <ToggleActiveButton template={t} />
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PlaceholderReference() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Placeholders available in templates</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-2 text-sm text-muted-foreground">
          Type these as <code>{"{placeholder}"}</code> anywhere in the DOCX file (e.g.{" "}
          <code>{"{applicant_name}"}</code>). A template only needs to use the ones relevant to
          it — a placeholder with no matching data on a given case will be reported clearly when
          generating that notice, instead of printing blank.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATE_PLACEHOLDERS.map((p) => (
            <code key={p} className="rounded bg-muted px-1.5 py-0.5 text-xs">
              {`{${p}}`}
            </code>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

type UploadFormValues = {
  name: string;
  notice_type: NoticeType;
  language: TemplateLanguage;
  whatsapp_template_name: string;
  file: FileList | undefined;
};

function UploadForm() {
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  // Bumped after a successful upload to remount (and so clear) the native file input —
  // browsers won't let JS set a file input's value, and react-hook-form's reset() can't
  // clear one either, so a key change forcing a remount is the standard workaround.
  const [fileInputKey, setFileInputKey] = useState(0);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<UploadFormValues>({
    defaultValues: { name: "", notice_type: "hearing", language: "en", whatsapp_template_name: "", file: undefined },
  });

  const onSubmit = handleSubmit((values) => {
    const file = values.file?.[0];
    if (!file) {
      setServerError("Choose a .docx file to upload.");
      return;
    }
    setServerError(null);
    startTransition(async () => {
      const result = await uploadTemplate({
        name: values.name.trim(),
        notice_type: values.notice_type,
        language: values.language,
        whatsapp_template_name: values.whatsapp_template_name.trim(),
        file,
      });
      if (result?.error) {
        setServerError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(result?.message ?? "Template uploaded.");
      reset({ name: "", notice_type: "hearing", language: "en", whatsapp_template_name: "", file: undefined });
      setFileInputKey((k) => k + 1);
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload template</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="template-name">Template name</Label>
            <Input
              id="template-name"
              maxLength={200}
              autoComplete="off"
              {...register("name", { required: "Enter a template name." })}
              aria-invalid={!!errors.name}
            />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="template-whatsapp">WhatsApp template name (optional)</Label>
            <Input
              id="template-whatsapp"
              maxLength={200}
              autoComplete="off"
              placeholder="e.g. hearing_notice_en"
              {...register("whatsapp_template_name")}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="template-type">Notice type</Label>
            <Controller
              control={control}
              name="notice_type"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="template-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTICE_TYPES.map((nt) => (
                      <SelectItem key={nt} value={nt}>
                        {NOTICE_TYPE_LABELS[nt]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="template-language">Language</Label>
            <Controller
              control={control}
              name="language"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="template-language" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((lang) => (
                      <SelectItem key={lang} value={lang}>
                        {LANGUAGE_LABELS[lang]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="template-file">DOCX file</Label>
            <input
              key={fileInputKey}
              id="template-file"
              type="file"
              accept=".docx"
              className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:font-medium"
              {...register("file", { required: "Choose a .docx file to upload." })}
            />
            {errors.file && <p className="text-sm text-destructive">{errors.file.message}</p>}
          </div>

          {serverError && (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {serverError}
            </p>
          )}

          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Uploading…" : "Upload template"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ToggleActiveButton({ template }: { template: NoticeTemplateRow }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await setTemplateActive({ id: template.id, active: !template.active });
          if (result?.error) {
            toast.error(result.error);
            return;
          }
          toast.success(result?.message ?? "Updated.");
        })
      }
    >
      {pending ? "Saving…" : template.active ? "Deactivate" : "Activate"}
    </Button>
  );
}

function EditWhatsappDialog({ template }: { template: NoticeTemplateRow }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(template.whatsapp_template_name ?? "");

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(template.whatsapp_template_name ?? "");
    }
  }, [open, template.whatsapp_template_name]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        Edit WhatsApp name
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>WhatsApp template name</DialogTitle>
          <DialogDescription>
            Must match the approved template name in the WhatsApp Business API / Make.com setup
            for &ldquo;{template.name}&rdquo;.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor={`whatsapp-${template.id}`}>Template name</Label>
          <Input
            id={`whatsapp-${template.id}`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={200}
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await updateTemplateWhatsapp({ id: template.id, whatsapp_template_name: value.trim() });
                if (result?.error) {
                  toast.error(result.error);
                  return;
                }
                toast.success(result?.message ?? "Updated.");
                setOpen(false);
              })
            }
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
