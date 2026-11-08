import crypto from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { canAccessOffice, canCreateEnvelopes, requireAdminApi } from "@/lib/auth";
import { convertUploadToPdf, detectSupportedUpload } from "@/lib/documentImport";
import { addAuditEvent, readEnvelopes, writeEnvelopes } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;

async function removeStoredFile(relativePath: string | null | undefined) {
  if (!relativePath) return;
  try {
    const absolute = path.isAbsolute(relativePath) ? relativePath : path.join(process.cwd(), relativePath);
    await unlink(absolute);
  } catch {
    /* missing file ok */
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!canCreateEnvelopes(session)) {
    return NextResponse.json({ error: "Your role cannot replace documents." }, { status: 403 });
  }

  const { id } = await params;
  const envelopes = await readEnvelopes();
  const envelope = envelopes.find((item) => item.id === id);
  if (!envelope || !canAccessOffice(session, envelope.officeId)) {
    return NextResponse.json({ error: "Envelope not found." }, { status: 404 });
  }
  if (envelope.status !== "draft") {
    return NextResponse.json({ error: "Only draft contracts can change documents." }, { status: 409 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  const pdfFile = formData.get("pdfFile");
  if (!(pdfFile instanceof File) || pdfFile.size <= 0) {
    return NextResponse.json({ error: "Choose a document to upload." }, { status: 400 });
  }
  if (pdfFile.size > MAX_UPLOAD_SIZE) {
    return NextResponse.json({ error: "Document must be 20 MB or smaller." }, { status: 400 });
  }
  if (!detectSupportedUpload(pdfFile.name, pdfFile.type)) {
    return NextResponse.json(
      { error: "Unsupported file type. Upload PDF, Word (.docx), text (.txt), PNG, JPG, or JPEG." },
      { status: 400 }
    );
  }

  try {
    const converted = await convertUploadToPdf({
      bytes: Buffer.from(await pdfFile.arrayBuffer()),
      fileName: pdfFile.name,
      mimeType: pdfFile.type,
      title: envelope.title,
    });
    const fileBytes = Buffer.from(converted.pdfBytes);
    const originalDirectory = path.join(process.cwd(), "storage", "offices", envelope.officeId, "original");
    await mkdir(originalDirectory, { recursive: true });
    const fileName = `${envelope.id}.pdf`;
    const relativePath = `storage/offices/${envelope.officeId}/original/${fileName}`;
    await writeFile(path.join(originalDirectory, fileName), fileBytes);

    // Drop previous working/signed copies — new source document.
    await removeStoredFile(envelope.workingPdfPath);
    await removeStoredFile(envelope.signedPdfPath);
    if (envelope.originalPdfPath && envelope.originalPdfPath !== relativePath) {
      await removeStoredFile(envelope.originalPdfPath);
    }

    envelope.originalFileName = pdfFile.name;
    envelope.originalPdfPath = relativePath;
    envelope.workingPdfPath = null;
    envelope.signedPdfPath = null;
    envelope.originalSha256 = crypto.createHash("sha256").update(fileBytes).digest("hex");
    envelope.signedSha256 = null;
    envelope.certificateId = null;
    // Old field coordinates are for the previous PDF — clear so Prepare starts clean.
    envelope.fields = [];
    envelope.pageAssignments = [];
    envelope.preparedAt = null;
    envelope.updatedAt = new Date().toISOString();

    await writeEnvelopes(envelopes);
    await addAuditEvent({
      officeId: envelope.officeId,
      envelopeId: envelope.id,
      recipientId: null,
      type: "envelope_created",
      message: `${session.name} replaced draft document`,
      ipAddress: null,
      userAgent: request.headers.get("user-agent"),
      metadata: { action: "replace-document", fileName: pdfFile.name },
    });

    return NextResponse.json({
      success: true,
      envelopeId: envelope.id,
      originalFileName: envelope.originalFileName,
      documentSrc: `/api/admin/envelopes/${envelope.id}/document?t=${Date.now()}`,
    });
  } catch (error) {
    console.error("[replace-document]", id, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not replace document." },
      { status: 400 }
    );
  }
}
