import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { createPolicyPdf } from "@/lib/pdf";
import type { TemplateDocumentRecord, TemplateRecord } from "@/lib/types";

function absoluteStoragePath(filePath: string) {
  return path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
}

export async function mergeTemplateDocumentPdfs(documents: TemplateDocumentRecord[]) {
  const sorted = [...documents]
    .filter((doc) => Boolean(doc.filePath))
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  if (!sorted.length) {
    throw new Error("This template has no uploaded documents.");
  }

  if (sorted.length === 1) {
    const bytes = await readFile(absoluteStoragePath(sorted[0].filePath));
    return {
      bytes,
      originalFileName: sorted[0].originalFileName || "template.pdf",
    };
  }

  const merged = await PDFDocument.create();
  for (const doc of sorted) {
    const sourceBytes = await readFile(absoluteStoragePath(doc.filePath));
    const source = await PDFDocument.load(sourceBytes);
    const pages = await merged.copyPages(source, source.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }

  return {
    bytes: Buffer.from(await merged.save()),
    originalFileName: sorted.map((doc) => doc.originalFileName).filter(Boolean).join(" + ") || "template.pdf",
  };
}

export async function resolveTemplatePdfForEnvelope(input: {
  template: TemplateRecord;
  officeName: string;
  title: string;
  recipients: Array<{ name: string; email: string }>;
}) {
  const docs = input.template.documents || [];
  if (docs.some((doc) => doc.filePath)) {
    return mergeTemplateDocumentPdfs(docs);
  }

  const content =
    input.template.content ||
    input.template.description ||
    input.template.message ||
    input.template.name ||
    input.title;
  const bytes = await createPolicyPdf({
    officeName: input.officeName,
    title: input.title,
    content,
    recipients: input.recipients,
  });
  return {
    bytes: Buffer.from(bytes),
    originalFileName: `${input.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "template"}.pdf`,
  };
}
