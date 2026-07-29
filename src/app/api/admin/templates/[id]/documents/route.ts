import { NextResponse } from "next/server";
import { canAccessOffice, requireAdminApi } from "@/lib/auth";
import { createTemplateService } from "@/lib/services/templateService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const templateService = createTemplateService();

/** Upload documents immediately while editing a template — preview works in the same form. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (session.role === "viewer") return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const { id } = await context.params;
  const template = await templateService.getById(id);
  if (!template || !canAccessOffice(session, template.officeId)) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }
  if (!template.currentVersionId) {
    return NextResponse.json({ error: "Template version not found." }, { status: 400 });
  }

  try {
    const formData = await request.formData();
    const files = formData
      .getAll("documentFiles")
      .filter((item): item is File => item instanceof File && item.size > 0);
    if (!files.length) {
      return NextResponse.json({ error: "Choose at least one document to upload." }, { status: 400 });
    }

    const uploaded = await templateService.documentService.uploadMany({
      templateId: template.id,
      versionId: template.currentVersionId,
      officeId: template.officeId,
      files,
      mode: "append",
    });

    const refreshed = await templateService.getById(id);
    return NextResponse.json({
      ok: true,
      uploaded,
      documents: refreshed?.documents || [],
    });
  } catch (error) {
    console.error("[template-upload]", id, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed." },
      { status: 400 }
    );
  }
}
