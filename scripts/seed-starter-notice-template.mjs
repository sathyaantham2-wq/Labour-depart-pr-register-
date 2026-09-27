// ONE-OFF, TEMPORARY script (see frontend-builder task 4). Builds a minimal, valid .docx
// starter template for notice_type="hearing"/language="en", uploads it to the private
// `notices` storage bucket under templates/, and inserts the matching notice_templates row —
// so the Notice Generator has something to actually render against before the department's
// real letterhead content exists. Run once with `node scripts/seed-starter-notice-template.mjs`
// from the project root, then delete this file.
import { randomUUID } from "node:crypto";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import PizZip from "pizzip";

const root = path.resolve(import.meta.dirname, "..");
process.chdir(root);
process.loadEnvFile(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url) fail("NEXT_PUBLIC_SUPABASE_URL is not set in .env.local");
if (!serviceRoleKey) fail("SUPABASE_SERVICE_ROLE_KEY is not set in .env.local");

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

function escapeXml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function paragraph(text) {
  if (!text) return "<w:p/>";
  return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

const paragraphs = [
  "[OFFICE LETTERHEAD / SEAL — REPLACE THIS SECTION WITH YOUR OFFICE'S ACTUAL LETTERHEAD]",
  "",
  "File No: {file_number}                                              Date: {today_date}",
  "",
  "To,",
  "{applicant_name}",
  "",
  "Subject: {subject}",
  "Act: {act}",
  "",
  "You are hereby informed that the above case has been posted for hearing on {hearing_date} at {hearing_time}. You are requested to appear in person or through an authorized representative before this office on the said date and time, along with all relevant documents relating to the matter, failing which further action will be taken as deemed fit as per rules.",
  "",
  "This is a DRAFT PLACEHOLDER notice for testing purposes only. It is not approved department wording and must be replaced with the office's actual letterhead, seal and finalized text before any real use.",
  "",
  "",
  "[Signature / Designation of Issuing Officer]",
]
  .map(paragraph)
  .join("");

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const documentRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Draft Hearing Notice (EN) - NEEDS CUSTOMIZATION</dc:title>
  <dc:creator>Labour Case Management App</dc:creator>
</cp:coreProperties>`;

const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>Labour Case Management App</Application>
</Properties>`;

const zip = new PizZip();
zip.file("[Content_Types].xml", contentTypesXml);
zip.file("_rels/.rels", rootRelsXml);
zip.file("word/document.xml", documentXml);
zip.file("word/_rels/document.xml.rels", documentRelsXml);
zip.file("docProps/core.xml", coreXml);
zip.file("docProps/app.xml", appXml);

const buffer = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });

const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

const docPath = `templates/${randomUUID()}.docx`;

const { error: uploadError } = await admin.storage.from("notices").upload(docPath, buffer, {
  contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  upsert: false,
});
if (uploadError) fail(`Storage upload failed: ${uploadError.message}`);
console.log(`✔ Uploaded ${docPath} to the notices bucket (${buffer.length} bytes)`);

const { data: row, error: insertError } = await admin
  .from("notice_templates")
  .insert({
    name: "Draft Hearing Notice (EN) — NEEDS CUSTOMIZATION",
    notice_type: "hearing",
    language: "en",
    docx_path: docPath,
    active: true,
  })
  .select("*")
  .single();
if (insertError) {
  await admin.storage.from("notices").remove([docPath]);
  fail(`notice_templates insert failed: ${insertError.message}`);
}

console.log(`✔ notice_templates row created: id=${row.id}`);
console.log("\nDone. Delete this script (scripts/seed-starter-notice-template.mjs) now that it has run.");
