import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const SUPPORTED_UPLOAD_EXTENSIONS = [".pdf", ".docx", ".txt", ".png", ".jpg", ".jpeg"] as const;

export type SupportedUploadExtension = (typeof SUPPORTED_UPLOAD_EXTENSIONS)[number];

const EXTENSION_MIME: Record<string, string[]> = {
  ".pdf": ["application/pdf"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".txt": ["text/plain"],
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
};

function safeText(value: string) {
  return value.replace(/[^\x20-\x7E\n\r\t]/g, "?");
}

function extensionOf(fileName: string) {
  const index = fileName.lastIndexOf(".");
  return index >= 0 ? fileName.slice(index).toLowerCase() : "";
}

export function detectSupportedUpload(fileName: string, mimeType = "") {
  const extension = extensionOf(fileName);
  if (!SUPPORTED_UPLOAD_EXTENSIONS.includes(extension as SupportedUploadExtension)) {
    return null;
  }
  const allowedMime = EXTENSION_MIME[extension] || [];
  if (mimeType && allowedMime.length && !allowedMime.includes(mimeType)) {
    // Browsers sometimes send empty or generic mime types — extension wins.
    if (mimeType !== "application/octet-stream") {
      return extension as SupportedUploadExtension;
    }
  }
  return extension as SupportedUploadExtension;
}

function wrapLines(text: string, maxChars = 90) {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    const words = paragraph.split(/\s+/);
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxChars) {
        if (current) lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
  }
  return lines.length ? lines : [""];
}

async function textToPdfBytes(title: string, content: string) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 54;
  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = 720;

  const newPage = () => {
    page = pdf.addPage([pageWidth, pageHeight]);
    y = 720;
  };

  page.drawText(safeText(title), {
    x: margin,
    y,
    size: 18,
    font: bold,
    color: rgb(0.07, 0.09, 0.14),
    maxWidth: pageWidth - margin * 2,
  });
  y -= 36;

  for (const line of wrapLines(safeText(content))) {
    if (y < 72) newPage();
    if (line) {
      page.drawText(line, {
        x: margin,
        y,
        size: 11,
        font: regular,
        color: rgb(0.12, 0.14, 0.18),
        maxWidth: pageWidth - margin * 2,
      });
    }
    y -= line ? 16 : 10;
  }

  return pdf.save();
}

async function imageToPdfBytes(bytes: Buffer, format: "png" | "jpg") {
  const pdf = await PDFDocument.create();
  const image = format === "png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 36;
  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  const width = image.width * scale;
  const height = image.height * scale;
  const page = pdf.addPage([pageWidth, pageHeight]);
  page.drawImage(image, {
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
    width,
    height,
  });
  return pdf.save();
}

async function docxToText(bytes: Buffer) {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: bytes });
  return result.value.trim();
}

export async function convertUploadToPdf(input: {
  bytes: Buffer;
  fileName: string;
  mimeType?: string;
  title: string;
}) {
  const extension = detectSupportedUpload(input.fileName, input.mimeType || "");
  if (!extension) {
    throw new Error("Unsupported file type. Upload PDF, DOCX, TXT, PNG, JPG, or JPEG.");
  }

  if (extension === ".pdf") {
    if (input.bytes.length < 5 || input.bytes.toString("utf8", 0, 5) !== "%PDF-") {
      throw new Error("The uploaded PDF file is invalid.");
    }
    const pdf = await PDFDocument.load(input.bytes);
    if (pdf.getPageCount() < 1) throw new Error("The uploaded PDF must contain at least one page.");
    return {
      pdfBytes: input.bytes,
      originalFileName: input.fileName,
      convertedFrom: extension,
    };
  }

  if (extension === ".txt") {
    const text = input.bytes.toString("utf8");
    if (!text.trim()) throw new Error("The text file is empty.");
    return {
      pdfBytes: Buffer.from(await textToPdfBytes(input.title, text)),
      originalFileName: input.fileName,
      convertedFrom: extension,
    };
  }

  if (extension === ".docx") {
    const text = await docxToText(input.bytes);
    if (text.length < 1) throw new Error("Could not read text from the Word document.");
    return {
      pdfBytes: Buffer.from(await textToPdfBytes(input.title, text)),
      originalFileName: input.fileName,
      convertedFrom: extension,
    };
  }

  if (extension === ".png") {
    return {
      pdfBytes: Buffer.from(await imageToPdfBytes(input.bytes, "png")),
      originalFileName: input.fileName,
      convertedFrom: extension,
    };
  }

  return {
    pdfBytes: Buffer.from(await imageToPdfBytes(input.bytes, "jpg")),
    originalFileName: input.fileName,
    convertedFrom: extension,
  };
}

export const UPLOAD_ACCEPT =
  ".pdf,.docx,.txt,.png,.jpg,.jpeg,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/png,image/jpeg";

export const UPLOAD_HELP_TEXT = "Supported: PDF, Word (.docx), text (.txt), PNG, JPG. Max 20 MB.";
