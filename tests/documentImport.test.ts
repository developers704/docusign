import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { convertUploadToPdf, detectSupportedUpload } from "@/lib/documentImport";

test("detectSupportedUpload accepts common document types", () => {
  assert.equal(detectSupportedUpload("contract.pdf"), ".pdf");
  assert.equal(detectSupportedUpload("notes.docx"), ".docx");
  assert.equal(detectSupportedUpload("policy.txt"), ".txt");
  assert.equal(detectSupportedUpload("scan.png"), ".png");
  assert.equal(detectSupportedUpload("photo.jpg"), ".jpg");
  assert.equal(detectSupportedUpload("photo.jpeg"), ".jpeg");
  assert.equal(detectSupportedUpload("legacy.doc"), null);
});

test("convertUploadToPdf converts plain text to a valid PDF", async () => {
  const result = await convertUploadToPdf({
    bytes: Buffer.from("Hello agreement text for signing."),
    fileName: "agreement.txt",
    mimeType: "text/plain",
    title: "Agreement",
  });

  assert.equal(result.convertedFrom, ".txt");
  assert.ok(result.pdfBytes.length > 100);
  assert.match(result.pdfBytes.toString("utf8", 0, 5), /^%PDF-/);

  const pdf = await PDFDocument.load(result.pdfBytes);
  assert.ok(pdf.getPageCount() >= 1);
});

test("convertUploadToPdf passes through valid PDF bytes", async () => {
  const source = await PDFDocument.create();
  source.addPage([612, 792]);
  const sourceBytes = Buffer.from(await source.save());

  const result = await convertUploadToPdf({
    bytes: sourceBytes,
    fileName: "existing.pdf",
    mimeType: "application/pdf",
    title: "Existing",
  });

  assert.equal(result.convertedFrom, ".pdf");
  assert.equal(result.pdfBytes.length, sourceBytes.length);
});

test("convertUploadToPdf rejects unsupported extensions", async () => {
  await assert.rejects(
    () =>
      convertUploadToPdf({
        bytes: Buffer.from("data"),
        fileName: "archive.zip",
        title: "Archive",
      }),
    /Unsupported file type/
  );
});
