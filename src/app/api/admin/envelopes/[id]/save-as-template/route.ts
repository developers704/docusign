import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { canAccessOffice, canCreateEnvelopes, requireAdminApi } from "@/lib/auth";
import { createTemplateService } from "@/lib/services/templateService";
import { getEnvelopeById } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const templateService = createTemplateService();

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!canCreateEnvelopes(session) || session.role === "viewer") {
    return NextResponse.json({ error: "Your role cannot save templates." }, { status: 403 });
  }

  const { id } = await params;
  const envelope = await getEnvelopeById(id);
  if (!envelope || !canAccessOffice(session, envelope.officeId)) {
    return NextResponse.json({ error: "Contract not found." }, { status: 404 });
  }

  const sourceRelative =
    (envelope.status === "completed" && envelope.signedPdfPath) ||
    envelope.workingPdfPath ||
    envelope.originalPdfPath;
  if (!sourceRelative) {
    return NextResponse.json({ error: "This contract has no document to save as a template." }, { status: 400 });
  }

  const created = await templateService.createTemplate({
    actor: { userId: session.userId, email: session.email, role: session.role },
    officeId: envelope.officeId,
    name: envelope.title,
    title: envelope.title,
    description: envelope.message || "",
    message: envelope.message || "",
    content: "",
    category: envelope.category || "",
    tags: [],
    visibility: "office",
    selectedOfficeIds: [],
    selectedGroupIds: [],
    roleNames: ["Signer"],
    sourceType: "uploaded_pdf",
    expiryDays: 0,
    internalNotes: `Saved from contract ${envelope.envelopeNumber}`,
  });

  const versionId = created.currentVersionId;
  if (!versionId) {
    return NextResponse.json({ error: "Template version missing after create." }, { status: 500 });
  }

  const sourceAbsolute = path.isAbsolute(sourceRelative)
    ? sourceRelative
    : path.join(process.cwd(), sourceRelative);

  try {
    const bytes = await readFile(sourceAbsolute);
    const fileName = envelope.originalFileName || "document.pdf";
    const file = new File([bytes], fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`, {
      type: "application/pdf",
    });
    await templateService.documentService.uploadPdf({
      templateId: created.id,
      versionId,
      officeId: envelope.officeId,
      file,
      mode: "replace",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Template created but document upload failed.",
        templateId: created.id,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, templateId: created.id });
}
