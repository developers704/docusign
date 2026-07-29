import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import test from "node:test";
import { mergeTemplateDocumentPdfs } from "../src/lib/services/templatePdfResolve";
import type { TemplateDocumentRecord } from "../src/lib/types";

async function makePdf(pages: number) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) pdf.addPage([200, 200]);
  return Buffer.from(await pdf.save());
}

function doc(partial: Partial<TemplateDocumentRecord> & Pick<TemplateDocumentRecord, "id" | "originalFileName" | "filePath" | "sortOrder" | "pageCount">): TemplateDocumentRecord {
  return {
    templateId: "t",
    versionId: "v",
    storedFileName: partial.originalFileName,
    mimeType: "application/pdf",
    fileSize: 1,
    sha256: partial.id,
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

test("mergeTemplateDocumentPdfs merges multiple template PDFs in sort order", async () => {
  const dir = path.join(process.cwd(), "storage", "tmp-template-merge-test");
  await mkdir(dir, { recursive: true });
  try {
    const firstPath = path.join(dir, "first.pdf");
    const secondPath = path.join(dir, "second.pdf");
    await writeFile(firstPath, await makePdf(1));
    await writeFile(secondPath, await makePdf(2));

    const relativeFirst = path.relative(process.cwd(), firstPath).replace(/\\/g, "/");
    const relativeSecond = path.relative(process.cwd(), secondPath).replace(/\\/g, "/");

    const merged = await mergeTemplateDocumentPdfs([
      doc({ id: "2", originalFileName: "second.pdf", filePath: relativeSecond, sortOrder: 2, pageCount: 2 }),
      doc({ id: "1", originalFileName: "first.pdf", filePath: relativeFirst, sortOrder: 1, pageCount: 1 }),
    ]);
    const pdf = await PDFDocument.load(merged.bytes);
    assert.equal(pdf.getPageCount(), 3);
    assert.match(merged.originalFileName, /first\.pdf/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
