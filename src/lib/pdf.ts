import crypto from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFImage } from "pdf-lib";
import type { EnvelopeRecord, RecipientRecord, SignatureMethod } from "./types";
import { formatSignerLocalDate } from "./timezone";
import { trimSignaturePng } from "./signatureImageTrim";

export type SignaturePayload = {
  method: SignatureMethod;
  imageBytes: Buffer;
  imageFormat: "png" | "jpg";
  /** DocuSign-style short initials ink (separate from full signature). */
  initialsImageBytes?: Buffer;
  initialsImageFormat?: "png" | "jpg";
  fieldValues?: Record<string, string>;
};

function safeText(value: string) {
  return value.replace(/[^\x20-\x7E]/g, "?");
}

function formatRecipientSignedAt(recipient: RecipientRecord, fallbackIso?: string | null) {
  return safeText(
    formatSignerLocalDate({
      value: recipient.signedAt || fallbackIso || null,
      localDisplay: recipient.signerLocalTimeDisplay,
      timeZone: recipient.signerTimezone,
      timezoneOffsetMinutes: recipient.signerTimezoneOffsetMinutes,
    })
  );
}

function formatEnvelopeCompletedAt(envelope: EnvelopeRecord) {
  const signer = [...envelope.recipients]
    .sort((a, b) => {
      const aAt = a.completedAt || a.signedAt || "";
      const bAt = b.completedAt || b.signedAt || "";
      return aAt.localeCompare(bAt);
    })
    .reverse()
    .find(
      (recipient) =>
        recipient.signerTimezone || typeof recipient.signerTimezoneOffsetMinutes === "number"
    );
  // Format the completion instant in the last signer's zone (do not reuse their personal signedAtLocal string).
  return safeText(
    formatSignerLocalDate({
      value: envelope.completedAt,
      localDisplay: null,
      timeZone: signer?.signerTimezone,
      timezoneOffsetMinutes: signer?.signerTimezoneOffsetMinutes,
    })
  );
}

function drawSignatureImage(
  page: ReturnType<PDFDocument["addPage"]>,
  image: PDFImage,
  centerX: number,
  baselineY: number
) {
  const maxWidth = 220;
  const maxHeight = 86;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, {
    x: centerX - width / 2,
    y: baselineY + 10,
    width,
    height,
  });
}

export async function applyRecipientSignature(
  envelope: EnvelopeRecord,
  recipient: RecipientRecord,
  signature: SignaturePayload
) {
  const sourcePath = envelope.workingPdfPath || envelope.originalPdfPath;
  const sourceBytes = await readFile(path.join(process.cwd(), sourcePath));
  const pdf = await PDFDocument.load(sourceBytes);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const trimmedPng =
    signature.imageFormat === "png" ? trimSignaturePng(signature.imageBytes) : null;
  const signatureBytes = trimmedPng?.bytes || signature.imageBytes;
  const signatureImage =
    signature.imageFormat === "png"
      ? await pdf.embedPng(signatureBytes)
      : await pdf.embedJpg(signature.imageBytes);

  let initialsImage = signatureImage;
  if (signature.initialsImageBytes?.length) {
    const initialsFormat = signature.initialsImageFormat || "png";
    const trimmedInitials =
      initialsFormat === "png" ? trimSignaturePng(signature.initialsImageBytes) : null;
    const initialsBytes = trimmedInitials?.bytes || signature.initialsImageBytes;
    initialsImage =
      initialsFormat === "png"
        ? await pdf.embedPng(initialsBytes)
        : await pdf.embedJpg(signature.initialsImageBytes);
  }

  for (const field of (envelope.fields || []).filter((item) => item.recipientId === recipient.id)) {
    const target = pdf.getPages()[field.page - 1];
    if (!target) continue;
    const pageWidth = target.getWidth();
    const pageHeight = target.getHeight();
    const x = (field.x / 100) * pageWidth;
    const width = (field.width / 100) * pageWidth;
    const height = (field.height / 100) * pageHeight;
    const y = pageHeight - ((field.y / 100) * pageHeight) - height;
    if (field.type === "signature" || field.type === "initials" || field.type.endsWith("_signature")) {
      const inkImage = field.type === "initials" ? initialsImage : signatureImage;
      // Fit image into field, but prefer a tighter box so underline tracks ink.
      const fitScale = Math.min(width / inkImage.width, height / inkImage.height, 1);
      let imageWidth = inkImage.width * fitScale;
      let imageHeight = inkImage.height * fitScale;
      // Cap extremely wide canvases so a tiny scribble does not keep a huge underline.
      const maxInkWidth = Math.min(width, Math.max(36, width * (field.type === "initials" ? 0.85 : 0.55)));
      if (imageWidth > maxInkWidth) {
        const shrink = maxInkWidth / imageWidth;
        imageWidth *= shrink;
        imageHeight *= shrink;
      }
      const imageX = x + (width - imageWidth) / 2;
      const imageY = y + (height - imageHeight) / 2;
      target.drawImage(inkImage, {
        x: imageX,
        y: imageY,
        width: imageWidth,
        height: imageHeight,
      });
      // Underline only as wide as the rendered signature ink.
      if (imageWidth > 4) {
        target.drawLine({
          start: { x: imageX, y },
          end: { x: imageX + imageWidth, y },
          thickness: 0.7,
          color: rgb(0.25, 0.27, 0.31),
        });
      }
      continue;
    }
    let value = signature.fieldValues?.[field.id] || "";
    if (field.type === "name" || field.type === "signer_name") value = recipient.name;
    if (field.type === "email" || field.type === "signer_email") value = recipient.email;
    if (field.type === "date" || field.type === "signature_date" || field.type === "auto_date") {
      if (!value) {
        const when = recipient.signedAt || new Date().toISOString();
        value = formatSignerLocalDate({
          value: when,
          localDisplay: null,
          timeZone: recipient.signerTimezone,
          timezoneOffsetMinutes: recipient.signerTimezoneOffsetMinutes,
        }).split(",")[0];
      }
    }
    if (["signer_company", "signer_title", "phone", "address", "number", "dropdown", "radio_group", "text", "instruction_text"].includes(field.type)) {
      value ||= signature.fieldValues?.[field.id] || field.value || "";
    }
    if (field.type === "approve") value = value || "Approved";
    if (field.type === "decline") value = value || "Declined";
    if (field.type === "checkbox" || field.type === "consent_checkbox") {
      target.drawRectangle({ x, y: y + Math.max(0, (height - 12) / 2), width: 12, height: 12, borderColor: rgb(0.2, 0.22, 0.26), borderWidth: 1 });
      if (value === "true" || value === "Approved") target.drawText("X", { x: x + 2, y: y + Math.max(0, (height - 12) / 2) + 1, size: 10, font: bold });
    } else if (value) {
      const text = safeText(value);
      const fontSize = Math.max(7, Math.min(11, height * 0.55));
      const maxTextWidth = Math.max(10, width - 4);
      const textWidth = Math.min(regular.widthOfTextAtSize(text, fontSize), maxTextWidth);
      const textX = x + 2;
      target.drawText(text, {
        x: textX,
        y: y + Math.max(2, (height - 10) / 2),
        size: fontSize,
        font: regular,
        color: rgb(0.08, 0.1, 0.14),
        maxWidth: maxTextWidth,
      });
      // Underline only as wide as the rendered text.
      if (textWidth > 2) {
        target.drawLine({
          start: { x: textX, y },
          end: { x: textX + textWidth, y },
          thickness: 0.5,
          color: rgb(0.55, 0.57, 0.62),
        });
      }
    }
  }

  const page = pdf.addPage([612, 792]);
  const navy = rgb(0.06, 0.12, 0.26);
  const gold = rgb(0.72, 0.58, 0.28);
  const muted = rgb(0.4, 0.43, 0.48);
  const ink = rgb(0.1, 0.12, 0.16);
  const cream = rgb(0.995, 0.99, 0.98);

  page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: cream });
  page.drawRectangle({ x: 22, y: 22, width: 568, height: 748, borderColor: navy, borderWidth: 1.6 });
  page.drawRectangle({ x: 28, y: 28, width: 556, height: 736, borderColor: gold, borderWidth: 0.9 });

  page.drawRectangle({ x: 40, y: 700, width: 532, height: 52, color: navy });
  page.drawRectangle({ x: 40, y: 700, width: 532, height: 2.5, color: gold });
  page.drawText("ELECTRONIC SIGNATURE RECORD", { x: 54, y: 726, size: 15, font: bold, color: rgb(1, 1, 1) });
  page.drawText(`${safeText(envelope.officeName)}  ·  Envelope ${safeText(envelope.envelopeNumber)}`, {
    x: 54,
    y: 710,
    size: 9,
    font: regular,
    color: rgb(0.82, 0.86, 0.92),
  });

  page.drawText("Document", { x: 48, y: 670, size: 8, font: bold, color: muted });
  page.drawText(safeText(envelope.title), { x: 48, y: 652, size: 12, font: regular, color: ink, maxWidth: 500 });
  page.drawText("Signer", { x: 48, y: 620, size: 8, font: bold, color: muted });
  page.drawText(safeText(recipient.name), { x: 48, y: 602, size: 12, font: regular, color: ink });
  page.drawText("Email", { x: 318, y: 620, size: 8, font: bold, color: muted });
  page.drawText(safeText(recipient.email), { x: 318, y: 602, size: 11, font: regular, color: ink, maxWidth: 244 });

  page.drawRectangle({
    x: 48,
    y: 270,
    width: 516,
    height: 300,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.82, 0.84, 0.88),
    borderWidth: 1,
  });
  page.drawText("SIGNATURE", { x: 68, y: 546, size: 9, font: bold, color: muted });
  const centerX = 306;
  const lineY = 390;
  drawSignatureImage(page, signatureImage, centerX, lineY);
  page.drawLine({ start: { x: 156, y: lineY }, end: { x: 456, y: lineY }, thickness: 1, color: rgb(0.16, 0.18, 0.22) });
  const nameWidth = regular.widthOfTextAtSize(safeText(recipient.name), 13);
  page.drawText(safeText(recipient.name), { x: centerX - nameWidth / 2, y: 366, size: 13, font: regular, color: ink });
  const methodLabel =
    signature.method === "typed"
      ? "Typed electronic signature"
      : signature.method === "uploaded"
        ? "Uploaded signature image"
        : "Drawn electronic signature";
  const methodWidth = italic.widthOfTextAtSize(methodLabel, 9);
  page.drawText(methodLabel, { x: centerX - methodWidth / 2, y: 348, size: 9, font: italic, color: muted });
  page.drawText(`Signed: ${formatRecipientSignedAt(recipient, new Date().toISOString())}`, {
    x: 68,
    y: 292,
    size: 9,
    font: regular,
    color: muted,
  });

  const bytes = await pdf.save();
  const workingDirectory = path.join(process.cwd(), "storage", "offices", envelope.officeId, "working");
  await mkdir(workingDirectory, { recursive: true });
  const fileName = `${envelope.id}.pdf`;
  const relativePath = `storage/offices/${envelope.officeId}/working/${fileName}`;
  await writeFile(path.join(workingDirectory, fileName), bytes);
  return relativePath;
}

export async function finalizeEnvelopePdf(envelope: EnvelopeRecord) {
  const sourcePath = envelope.workingPdfPath || envelope.originalPdfPath;
  const sourceBytes = await readFile(path.join(process.cwd(), sourcePath));
  const pdf = await PDFDocument.load(sourceBytes);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const page = pdf.addPage([612, 792]);
  const certificateId = `CERT-${envelope.id.slice(0, 8).toUpperCase()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const parties = [...envelope.recipients].sort((a, b) => a.order - b.order);
  const completedAt = formatEnvelopeCompletedAt(envelope);

  const navy = rgb(0.06, 0.12, 0.26);
  const navySoft = rgb(0.12, 0.2, 0.38);
  const gold = rgb(0.72, 0.58, 0.28);
  const ink = rgb(0.1, 0.12, 0.16);
  const muted = rgb(0.4, 0.43, 0.48);
  const line = rgb(0.82, 0.84, 0.88);
  const panel = rgb(0.97, 0.975, 0.985);
  const cream = rgb(0.995, 0.99, 0.98);
  const green = rgb(0.07, 0.55, 0.35);

  const fit = (text: string, font: typeof regular, size: number, maxWidth: number) => {
    let value = safeText(text);
    if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;
    while (value.length > 1 && font.widthOfTextAtSize(`${value}...`, size) > maxWidth) {
      value = value.slice(0, -1);
    }
    return `${value}...`;
  };

  // Soft page background + classic certificate double frame
  page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: cream });
  page.drawRectangle({ x: 22, y: 22, width: 568, height: 748, borderColor: navy, borderWidth: 2 });
  page.drawRectangle({ x: 28, y: 28, width: 556, height: 736, borderColor: gold, borderWidth: 1.1 });
  page.drawRectangle({ x: 34, y: 34, width: 544, height: 724, borderColor: navy, borderWidth: 0.7 });

  // Header band
  page.drawRectangle({ x: 40, y: 688, width: 532, height: 64, color: navy });
  page.drawRectangle({ x: 40, y: 688, width: 532, height: 3, color: gold });

  // Verified seal
  page.drawCircle({ x: 78, y: 720, size: 18, color: green });
  page.drawCircle({ x: 78, y: 720, size: 18, borderColor: rgb(1, 1, 1), borderWidth: 1.4 });
  page.drawLine({ start: { x: 68, y: 720 }, end: { x: 75, y: 713 }, thickness: 2.6, color: rgb(1, 1, 1) });
  page.drawLine({ start: { x: 75, y: 713 }, end: { x: 90, y: 728 }, thickness: 2.6, color: rgb(1, 1, 1) });

  page.drawText("CERTIFICATE OF COMPLETION", {
    x: 108,
    y: 728,
    size: 16,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText(fit(`${envelope.officeName}  ·  Electronic Signature Audit Record`, regular, 9, 430), {
    x: 108,
    y: 708,
    size: 9,
    font: regular,
    color: rgb(0.82, 0.86, 0.92),
  });

  // Intro statement
  page.drawText("This certificate confirms that the following agreement was completed using", {
    x: 48,
    y: 662,
    size: 9,
    font: regular,
    color: muted,
  });
  page.drawText("a secure, tamper-evident electronic signature process.", {
    x: 48,
    y: 650,
    size: 9,
    font: regular,
    color: muted,
  });

  // Document information panel
  page.drawText("DOCUMENT INFORMATION", { x: 48, y: 624, size: 8, font: bold, color: navySoft });
  page.drawRectangle({ x: 48, y: 512, width: 516, height: 104, color: panel, borderColor: line, borderWidth: 0.9 });

  const detailRows: Array<[string, string]> = [
    ["Document", fit(envelope.title, regular, 10, 360)],
    ["Office", fit(envelope.officeName, regular, 10, 360)],
    ["Envelope ID", fit(envelope.envelopeNumber, regular, 10, 360)],
    ["Certificate ID", fit(certificateId, regular, 10, 360)],
    ["Status", "Completed"],
    ["Completed", fit(completedAt, regular, 10, 360)],
  ];

  detailRows.forEach(([label, value], index) => {
    const rowY = 598 - index * 14;
    if (index % 2 === 1) {
      page.drawRectangle({ x: 48, y: rowY - 3, width: 516, height: 14, color: rgb(0.94, 0.95, 0.97) });
    }
    page.drawText(label, { x: 58, y: rowY, size: 8, font: bold, color: muted });
    page.drawText(value, { x: 156, y: rowY, size: 9.5, font: regular, color: ink });
  });

  // Signing parties
  page.drawText("SIGNING PARTIES", { x: 48, y: 490, size: 8, font: bold, color: navySoft });

  const partyTop = 474;
  const partyBottom = 168;
  const available = partyTop - partyBottom;
  const cardGap = 8;
  const cardHeight = Math.max(48, Math.min(68, (available - (parties.length - 1) * cardGap) / Math.max(parties.length, 1)));
  let y = partyTop;

  for (const recipient of parties) {
    const cardY = y - cardHeight;
    page.drawRectangle({
      x: 48,
      y: cardY,
      width: 516,
      height: cardHeight,
      color: rgb(1, 1, 1),
      borderColor: line,
      borderWidth: 0.9,
    });
    page.drawRectangle({ x: 48, y: cardY, width: 4, height: cardHeight, color: navy });

    const nameY = cardY + cardHeight - 16;
    const metaY = cardY + cardHeight - 32;
    const statusY = cardY + 10;

    page.drawText(fit(`${recipient.order}. ${recipient.name}`, bold, 10.5, 240), {
      x: 62,
      y: nameY,
      size: 10.5,
      font: bold,
      color: ink,
    });
    page.drawText(fit(recipient.email, regular, 8.5, 240), {
      x: 62,
      y: metaY,
      size: 8.5,
      font: regular,
      color: muted,
    });

    const method =
      recipient.signatureMethod === "typed"
        ? "Typed signature"
        : recipient.signatureMethod === "uploaded"
          ? "Uploaded signature"
          : recipient.signatureMethod === "drawn"
            ? "Drawn signature"
            : "Electronic action";

    page.drawText(fit(`Signed: ${formatRecipientSignedAt(recipient)}`, regular, 8, 230), {
      x: 318,
      y: nameY,
      size: 8,
      font: regular,
      color: ink,
    });
    page.drawText(fit(`IP: ${recipient.signerIpAddress || "unknown"}`, regular, 8, 230), {
      x: 318,
      y: metaY,
      size: 8,
      font: regular,
      color: muted,
    });
    page.drawText(fit(`${method}  ·  Consent recorded`, regular, 7.5, 480), {
      x: 62,
      y: statusY,
      size: 7.5,
      font: italic,
      color: green,
    });

    y = cardY - cardGap;
  }

  // Integrity panel
  const originalBytes = await readFile(path.join(process.cwd(), envelope.originalPdfPath));
  const originalHash = crypto.createHash("sha256").update(originalBytes).digest("hex");

  page.drawText("DOCUMENT INTEGRITY", { x: 48, y: 148, size: 8, font: bold, color: navySoft });
  page.drawRectangle({ x: 48, y: 78, width: 516, height: 62, color: panel, borderColor: line, borderWidth: 0.9 });
  page.drawText("Original document SHA-256", { x: 58, y: 122, size: 7.5, font: bold, color: muted });
  page.drawText(fit(originalHash, regular, 7, 496), { x: 58, y: 108, size: 7, font: regular, color: ink });
  page.drawText("Certificate ID", { x: 58, y: 92, size: 7.5, font: bold, color: muted });
  page.drawText(fit(certificateId, regular, 8, 496), { x: 140, y: 92, size: 8, font: regular, color: ink });

  // Legal attestation
  page.drawText(
    fit(
      "This record documents signing sequence, electronic consent, identity context, timestamps in the signer local time, and document integrity hashes.",
      regular,
      7.5,
      516
    ),
    { x: 48, y: 58, size: 7.5, font: regular, color: muted }
  );
  page.drawText(fit(`Generated by ${envelope.officeName}  ·  Certificate layout v2  ·  Do not alter`, italic, 7.5, 516), {
    x: 48,
    y: 44,
    size: 7.5,
    font: italic,
    color: navySoft,
  });

  const bytes = await pdf.save();
  const signedDirectory = path.join(process.cwd(), "storage", "offices", envelope.officeId, "signed");
  await mkdir(signedDirectory, { recursive: true });
  const fileName = `${envelope.id}.pdf`;
  const relativePath = `storage/offices/${envelope.officeId}/signed/${fileName}`;
  await writeFile(path.join(signedDirectory, fileName), bytes);
  const signedHash = crypto.createHash("sha256").update(bytes).digest("hex");
  return { relativePath, certificateId, originalHash, signedHash };
}

function wrapText(text: string, font: Awaited<ReturnType<PDFDocument["embedFont"]>>, size: number, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r/g, "").split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    const words = safeText(paragraph).split(/\s+/);
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export async function createPolicyPdf(input: {
  officeName: string;
  title: string;
  content: string;
  recipients: Array<{ name: string; email: string }>;
}) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 54;
  const bodySize = 10.5;
  const lineHeight = 16;
  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = 720;

  const addHeader = () => {
    page.drawRectangle({ x: 0, y: 740, width: pageWidth, height: 52, color: rgb(0.04, 0.06, 0.11) });
    page.drawText(safeText(input.officeName), { x: margin, y: 760, size: 10, font: bold, color: rgb(1, 1, 1) });
  };
  const newPage = () => {
    page = pdf.addPage([pageWidth, pageHeight]);
    addHeader();
    y = 710;
  };
  addHeader();
  page.drawText(safeText(input.title), { x: margin, y, size: 20, font: bold, color: rgb(0.07, 0.09, 0.14), maxWidth: pageWidth - margin * 2 });
  y -= 38;
  page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 1, color: rgb(0.85, 0.87, 0.9) });
  y -= 24;

  for (const line of wrapText(input.content, regular, bodySize, pageWidth - margin * 2)) {
    if (y < 90) newPage();
    if (line) page.drawText(line, { x: margin, y, size: bodySize, font: regular, color: rgb(0.12, 0.14, 0.18) });
    y -= line ? lineHeight : lineHeight * 0.7;
  }

  const requiredHeight = 105 + input.recipients.length * 48;
  if (y < requiredHeight) newPage();
  y -= 18;
  page.drawRectangle({ x: margin, y: y - requiredHeight + 18, width: pageWidth - margin * 2, height: requiredHeight, color: rgb(0.97, 0.98, 0.99), borderColor: rgb(0.82, 0.84, 0.88), borderWidth: 1 });
  page.drawText("EMPLOYEE ACKNOWLEDGEMENT & SIGNATURES", { x: margin + 18, y: y - 10, size: 11, font: bold, color: rgb(0.08, 0.1, 0.14) });
  page.drawText("By signing electronically, each employee confirms they have read, understood, and accepted this document.", { x: margin + 18, y: y - 31, size: 8.5, font: regular, color: rgb(0.35, 0.39, 0.45), maxWidth: pageWidth - margin * 2 - 36 });
  let rowY = y - 68;
  input.recipients.forEach((recipient, index) => {
    page.drawText(`${index + 1}. ${safeText(recipient.name)}`, { x: margin + 18, y: rowY, size: 9.5, font: bold });
    page.drawText(safeText(recipient.email), { x: margin + 18, y: rowY - 15, size: 8, font: regular, color: rgb(0.4, 0.43, 0.49) });
    page.drawLine({ start: { x: 330, y: rowY - 5 }, end: { x: 535, y: rowY - 5 }, thickness: 0.8, color: rgb(0.35, 0.38, 0.43) });
    page.drawText("Electronic signature", { x: 390, y: rowY - 18, size: 7.5, font: regular, color: rgb(0.45, 0.48, 0.54) });
    rowY -= 48;
  });

  return Buffer.from(await pdf.save());
}
