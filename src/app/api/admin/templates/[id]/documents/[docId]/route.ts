import path from "node:path";
import { NextResponse } from "next/server";
import { canAccessOffice, requireAdminApi } from "@/lib/auth";
import { servePdfFile } from "@/lib/pdfHttp";
import { createTemplateService } from "@/lib/services/templateService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const templateService = createTemplateService();

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; docId: string }> }
) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id, docId } = await context.params;
  const template = await templateService.getById(id);
  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }
  if (!canAccessOffice(session, template.officeId)) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  // Prefer current documents; also search version metadata in case top-level drifted.
  const fromTop = (template.documents || []).find((item) => item.id === docId);
  const fromVersions = (template.versions || [])
    .flatMap((version) => version.documentMetadata || [])
    .find((item) => item.id === docId);
  const doc = fromTop || fromVersions;
  if (!doc?.filePath) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  try {
    const absolute = path.isAbsolute(doc.filePath) ? doc.filePath : path.join(process.cwd(), doc.filePath);
    const download = new URL(request.url).searchParams.get("download") === "1";
    const fileName = doc.originalFileName || "document.pdf";
    return await servePdfFile(absolute, fileName, download);
  } catch (error) {
    console.error("[template-document]", id, docId, error);
    return NextResponse.json({ error: "Document file could not be read." }, { status: 404 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; docId: string }> }
) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (session.role === "viewer") return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { id, docId } = await context.params;
  const template = await templateService.getById(id);
  if (!template || !canAccessOffice(session, template.officeId) || !template.currentVersionId) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  try {
    await templateService.documentService.removeDocument({
      versionId: template.currentVersionId,
      documentId: docId,
    });
    const refreshed = await templateService.getById(id);
    return NextResponse.json({ ok: true, documents: refreshed?.documents || [] });
  } catch (error) {
    console.error("[template-document-delete]", id, docId, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed." },
      { status: 400 }
    );
  }
}
