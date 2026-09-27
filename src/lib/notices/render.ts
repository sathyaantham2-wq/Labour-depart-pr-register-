import "server-only";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { formatDateIST } from "@/lib/format-date";

// Data handed to the template renderer. Every value the template's
// placeholders might reference must be present as a string key here — even
// an intentionally blank field should be set to "" rather than omitted, so
// that "key omitted" (a real template/data mismatch) can be told apart from
// "key present but blank" (a deliberate empty field). Docxtemplater's
// nullGetter fires only for keys that resolve to null/undefined, which is
// exactly the omitted case: see renderNoticeTemplate below.
export type NoticeTemplateData = Record<string, string>;

// Thrown for anything that goes wrong turning a template + data object into
// a rendered DOCX buffer: an unreadable/corrupt template file, a malformed
// template (bad {tags}), or — most commonly — a template that references a
// placeholder with no matching key in `data`. The API route catches this
// specifically and turns it into an HTTP 422 with `missingPlaceholders` and
// a human-readable `message`, instead of a generic 500.
export class TemplateRenderError extends Error {
  readonly missingPlaceholders: string[];

  constructor(message: string, missingPlaceholders: string[] = []) {
    super(message);
    this.name = "TemplateRenderError";
    this.missingPlaceholders = missingPlaceholders;
  }
}

// Docxtemplater throws either a single tagged error or (most often) a
// "MultiError" whose `properties.errors` holds the individual failures, each
// with its own `properties.explanation`. Flatten that into one readable
// string rather than surfacing `[object Object]` or a raw stack trace.
function describeDocxtemplaterError(err: unknown): string {
  const properties = (err as { properties?: { errors?: unknown[]; explanation?: string } })
    ?.properties;
  if (properties?.errors && Array.isArray(properties.errors) && properties.errors.length > 0) {
    return properties.errors
      .map((sub) => {
        const explanation = (sub as { properties?: { explanation?: string } })?.properties
          ?.explanation;
        return explanation ?? (sub instanceof Error ? sub.message : String(sub));
      })
      .join("; ");
  }
  if (properties?.explanation) return properties.explanation;
  if (err instanceof Error) return err.message;
  return String(err);
}

// Renders a DOCX template (as a Buffer) with docxtemplater, using `data` as
// the placeholder values. Placeholders use the default {tag} delimiters.
//
// Any placeholder in the template with no corresponding key in `data`
// resolves to `undefined`, which docxtemplater reports through nullGetter —
// we collect those and throw a TemplateRenderError listing them, instead of
// silently rendering blank text (docxtemplater's default behaviour) or
// leaving the caller to guess why a notice looks wrong.
export function renderNoticeTemplate(templateBuffer: Buffer, data: NoticeTemplateData): Buffer {
  let zip: PizZip;
  try {
    zip = new PizZip(templateBuffer);
  } catch (err) {
    throw new TemplateRenderError(
      `The notice template could not be read as a DOCX file: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const missingPlaceholders = new Set<string>();

  let doc: Docxtemplater;
  try {
    doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: (part) => {
        if (part?.value) missingPlaceholders.add(part.value);
        return "";
      },
    });
  } catch (err) {
    throw new TemplateRenderError(
      `The notice template is malformed: ${describeDocxtemplaterError(err)}`,
    );
  }

  try {
    doc.render(data);
  } catch (err) {
    throw new TemplateRenderError(
      `Rendering the notice template failed: ${describeDocxtemplaterError(err)}`,
      Array.from(missingPlaceholders),
    );
  }

  if (missingPlaceholders.size > 0) {
    const list = Array.from(missingPlaceholders).sort();
    throw new TemplateRenderError(
      `The notice template uses placeholder(s) with no matching data: ${list.join(", ")}. ` +
        "Check the case, party and hearing records have the required fields filled in.",
      list,
    );
  }

  return doc.toBuffer();
}

// ---------------------------------------------------------------------------
// Building the placeholder data object from case / party / hearing records.
// ---------------------------------------------------------------------------

export interface NoticeCaseFields {
  file_number: string;
  subject: string;
  act: string;
  memo_number: string | null;
  received_date: string;
  next_hearing_date: string | null;
  office_code: string;
}

export interface NoticePartyFields {
  role: string; // "applicant" | "management"
  name: string;
  address: string | null;
  email: string | null;
  phone: string[];
  whatsapp_phone: string | null;
}

export interface NoticeHearingFields {
  hearing_date: string;
  hearing_time: string | null;
}

// Turns case + party + (optional) hearing rows into the flat string map the
// template renders against. Deliberately *omits* keys for data that doesn't
// exist (e.g. no hearing, or no party for a given role) rather than filling
// them with "" — that way, a template placeholder that needed that data
// comes back as a "missing placeholder" TemplateRenderError (see
// renderNoticeTemplate above), which is exactly the "missing data -> 422"
// behaviour the notice route needs, without a second parallel validation
// layer. A field that legitimately exists but is blank (e.g. no memo number
// yet) is also omitted for the same reason: {memo_number} in a template that
// requires one will correctly 422 rather than silently print blank.
//
// Placeholder naming scheme (document alongside each template):
//   today_date, file_number, subject, act, office_code, received_date,
//   memo_number, next_hearing_date, hearing_date, hearing_time,
//   applicant_name, applicant_address, applicant_email, applicant_phone,
//   applicant_whatsapp_phone, management_name, management_address,
//   management_email, management_phone, management_whatsapp_phone.
export function buildNoticeTemplateData(input: {
  caseFields: NoticeCaseFields;
  parties: NoticePartyFields[];
  hearing: NoticeHearingFields | null;
}): NoticeTemplateData {
  const data: NoticeTemplateData = {
    today_date: formatDateIST(new Date().toISOString()),
    file_number: input.caseFields.file_number,
    subject: input.caseFields.subject,
    act: input.caseFields.act,
    office_code: input.caseFields.office_code,
    received_date: formatDateIST(input.caseFields.received_date),
  };

  if (input.caseFields.memo_number) data.memo_number = input.caseFields.memo_number;
  if (input.caseFields.next_hearing_date) {
    data.next_hearing_date = formatDateIST(input.caseFields.next_hearing_date);
  }

  if (input.hearing) {
    data.hearing_date = formatDateIST(input.hearing.hearing_date);
    if (input.hearing.hearing_time) data.hearing_time = input.hearing.hearing_time;
  }

  for (const role of ["applicant", "management"]) {
    const party = input.parties.find((p) => p.role === role);
    if (!party) continue;
    data[`${role}_name`] = party.name;
    if (party.address) data[`${role}_address`] = party.address;
    if (party.email) data[`${role}_email`] = party.email;
    if (party.phone.length > 0) data[`${role}_phone`] = party.phone.join(", ");
    if (party.whatsapp_phone) data[`${role}_whatsapp_phone`] = party.whatsapp_phone;
  }

  return data;
}
