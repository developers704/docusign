import crypto from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { convertUploadToPdf, detectSupportedUpload } from "@/lib/documentImport";
import type { TemplateDocumentRecord } from "@/lib/types";
import type { TemplateDocumentRepository } from "@/lib/repositories/templateRepositories";

const MAX_TEMPLATE_UPLOAD_SIZE = 20 * 1024 * 1024;
const MAX_TEMPLATE_DOCUMENTS = 20;

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
}

export class TemplateDocumentService {
  constructor(private readonly documents: TemplateDocumentRepository) {}

  async list(versionId: string) {
    return this.documents.listByVersionId(versionId);
  }

  async uploadPdf(input: {
    templateId: string;
    versionId: string;
    officeId: string;
    file: File;
    mode?: "append" | "replace";
  }) {
    const mode = input.mode || "append";
    const { file } = input;
    const originalName = sanitizeFileName(file.name || "template.pdf");
    const extension = path.extname(originalName).toLowerCase();
    if (!detectSupportedUpload(originalName, file.type)) {
      throw new Error("Unsupported file type. Upload PDF, Word (.docx), text (.txt), PNG, JPG, or JPEG.");
    }
    if (file.size <= 0 || file.size > MAX_TEMPLATE_UPLOAD_SIZE) {
      throw new Error("Template document must be greater than 0 and up to 20 MB.");
    }

    const rawBytes = Buffer.from(await file.arrayBuffer());
    const converted = await convertUploadToPdf({
      bytes: rawBytes,
      fileName: originalName,
      mimeType: file.type,
      title: path.basename(originalName, extension) || "Template",
    });
    const bytes = converted.pdfBytes;

    const pdf = await PDFDocument.load(bytes);
    const pageCount = pdf.getPageCount();
    if (pageCount < 1) throw new Error("PDF must contain at least one page.");

    const storageDir = path.join(process.cwd(), "storage", "offices", input.officeId, "templates");
    await mkdir(storageDir, { recursive: true });
    const storedFileName = `${crypto.randomUUID()}.pdf`;
    const absolutePath = path.join(storageDir, storedFileName);
    await writeFile(absolutePath, bytes);
    const relativePath = `storage/offices/${input.officeId}/templates/${storedFileName}`;
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");

    const current = mode === "replace" ? [] : await this.documents.listByVersionId(input.versionId);
    if (mode === "append" && current.length >= MAX_TEMPLATE_DOCUMENTS) {
      throw new Error(`A template can include up to ${MAX_TEMPLATE_DOCUMENTS} documents.`);
    }

    const record: TemplateDocumentRecord = {
      id: crypto.randomUUID(),
      templateId: input.templateId,
      versionId: input.versionId,
      originalFileName: originalName,
      storedFileName,
      filePath: relativePath,
      mimeType: "application/pdf",
      fileSize: bytes.length,
      pageCount,
      sha256,
      sortOrder: current.length + 1,
      createdAt: new Date().toISOString(),
    };

    const next = [...current, record].map((item, index) => ({ ...item, sortOrder: index + 1 }));
    await this.documents.replaceForVersion(input.versionId, next);
    return record;
  }

  async uploadMany(input: {
    templateId: string;
    versionId: string;
    officeId: string;
    files: File[];
    mode?: "append" | "replace";
  }) {
    const files = input.files.filter((file) => file instanceof File && file.size > 0);
    if (!files.length) return [];
    let mode = input.mode || "append";
    const uploaded: TemplateDocumentRecord[] = [];
    for (const file of files) {
      uploaded.push(
        await this.uploadPdf({
          templateId: input.templateId,
          versionId: input.versionId,
          officeId: input.officeId,
          file,
          mode,
        })
      );
      mode = "append";
    }
    return uploaded;
  }

  async removeDocument(input: { versionId: string; documentId: string }) {
    const current = await this.documents.listByVersionId(input.versionId);
    const target = current.find((item) => item.id === input.documentId);
    if (!target) return;
    const next = current
      .filter((item) => item.id !== input.documentId)
      .map((item, index) => ({ ...item, sortOrder: index + 1 }));
    await this.documents.replaceForVersion(input.versionId, next);
    try {
      const absolute = path.isAbsolute(target.filePath) ? target.filePath : path.join(process.cwd(), target.filePath);
      await unlink(absolute);
    } catch {
      /* ignore missing file */
    }
  }
}
