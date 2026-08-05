import path from "node:path";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { servePdfBytes } from "@/lib/pdfHttp";
import { findEnvelopeByToken, getCurrentRecipient, isEnvelopeExpired } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await findEnvelopeByToken(token);
  if (!found) return new Response("Document not found", { status: 404 });
  const { envelope, recipient } = found;
  if (isEnvelopeExpired(envelope) || envelope.status === "voided") return new Response("This envelope is unavailable", { status: 410 });
  const current = getCurrentRecipient(envelope);
  const acted = ["signed", "approved", "acknowledged", "completed"].includes(recipient.status);
  if (!acted && current?.id !== recipient.id) {
    return new Response("This document is waiting for another signer", { status: 403 });
  }

  const storedPath = envelope.signedPdfPath || envelope.workingPdfPath || envelope.originalPdfPath;
  const absolute = path.isAbsolute(storedPath) ? storedPath : path.join(process.cwd(), storedPath);
  let bytes: Buffer;
  try {
    bytes = await readFile(absolute);
  } catch (error) {
    console.error("sign document: missing pdf", absolute, error);
    return new Response("Document file is missing on the server", { status: 404 });
  }
  const fileName = envelope.originalFileName || `${envelope.title || "document"}.pdf`;
  const assignments = envelope.pageAssignments || [];

  if (!assignments.length) {
    return servePdfBytes(bytes, fileName);
  }

  const source = await PDFDocument.load(bytes);
  const allowedPageNumbers = new Set<number>();
  for (const assignment of assignments) {
    if (assignment.visibility === "sender_only" || assignment.visibility === "internal_users_only") continue;
    if (assignment.visibility === "all_recipients") allowedPageNumbers.add(assignment.pageNumber);
    if (assignment.visibility === "assigned_recipients_only" && assignment.assignedRecipientIds.includes(recipient.id)) {
      allowedPageNumbers.add(assignment.pageNumber);
    }
    if (assignment.visibility === "specific_roles" && recipient.templateRoleId && assignment.assignedTemplateRoleIds.includes(recipient.templateRoleId)) {
      allowedPageNumbers.add(assignment.pageNumber);
    }
  }
  if (!allowedPageNumbers.size) return new Response("You are not authorized to view this document page set.", { status: 403 });

  const out = await PDFDocument.create();
  for (const pageNumber of [...allowedPageNumbers].sort((a, b) => a - b)) {
    if (pageNumber < 1 || pageNumber > source.getPageCount()) continue;
    const [copied] = await out.copyPages(source, [pageNumber - 1]);
    out.addPage(copied);
  }
  const outBytes = await out.save();
  return servePdfBytes(outBytes, fileName);
}
