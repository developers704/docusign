import { NextResponse } from "next/server";
import { canAccessOffice, requireAdmin } from "@/lib/auth";
import { getPowerFormById, upgradePowerFormTemplateVersion } from "@/lib/services/powerFormService";
import { createTemplateService } from "@/lib/services/templateService";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdmin();
    if (session.role === "viewer") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    const { id } = await context.params;
    const existing = await getPowerFormById(id);
    if (!existing || !canAccessOffice(session, existing.officeId)) {
      return NextResponse.json({ error: "PowerForm not found." }, { status: 404 });
    }
    const template = await createTemplateService().getById(existing.templateId);
    if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });
    const form = await upgradePowerFormTemplateVersion(id, template);
    return NextResponse.json({ id: form.id, templateVersionId: form.templateVersionId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to upgrade version." },
      { status: 400 }
    );
  }
}
