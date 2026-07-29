import { NextResponse } from "next/server";
import { canAccessOffice, requireAdmin } from "@/lib/auth";
import { createPowerForm } from "@/lib/services/powerFormService";
import {
  addFieldsToTemplateForPowerForm,
  type PlacedTemplateFieldInput,
} from "@/lib/services/powerFormTemplateFieldsService";
import { createTemplateService } from "@/lib/services/templateService";
import { templateHasSigningFields } from "@/lib/templateSigningFields";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await requireAdmin();
    if (session.role === "viewer") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    const body = (await request.json()) as Record<string, unknown>;
    const templateId = String(body.templateId || "");
    let template = await createTemplateService().getById(templateId);
    if (!template || !canAccessOffice(session, template.officeId)) {
      return NextResponse.json({ error: "Template not found." }, { status: 404 });
    }

    const placedFields = Array.isArray(body.placedFields)
      ? (body.placedFields as PlacedTemplateFieldInput[])
      : [];
    const shouldSavePlaced =
      placedFields.length > 0 &&
      (!templateHasSigningFields(template) || Boolean(body.replaceTemplateFields));

    if (shouldSavePlaced) {
      template = await addFieldsToTemplateForPowerForm({
        templateId: template.id,
        placedFields,
        replaceExisting: Boolean(body.replaceTemplateFields) || !templateHasSigningFields(template),
      });
      if (!template) {
        return NextResponse.json({ error: "Unable to save fields on template." }, { status: 400 });
      }
    }

    if (!templateHasSigningFields(template)) {
      return NextResponse.json(
        { error: "Place Signature or Initials on the document before creating the form." },
        { status: 400 }
      );
    }

    const form = await createPowerForm({
      template,
      name: String(body.name || ""),
      slug: body.slug ? String(body.slug) : undefined,
      description: String(body.description || ""),
      accessType: (body.accessType as "public" | "access_code" | "email_verified") || "public",
      accessCode: body.accessCode ? String(body.accessCode) : undefined,
      collectName: Boolean(body.collectName ?? true),
      collectEmail: Boolean(body.collectEmail ?? true),
      collectPhone: Boolean(body.collectPhone),
      collectEmployeeId: Boolean(body.collectEmployeeId),
      requireConsent: Boolean(body.requireConsent),
      consentText: body.consentText ? String(body.consentText) : undefined,
      successMessage: body.successMessage ? String(body.successMessage) : undefined,
      submissionLimit:
        body.submissionLimit === null || body.submissionLimit === undefined || body.submissionLimit === ""
          ? null
          : Number(body.submissionLimit),
      customIntakeFields: Array.isArray(body.customIntakeFields)
        ? (body.customIntakeFields as never[])
        : [],
      publish: Boolean(body.publish),
      actor: { userId: session.userId, email: session.email },
    });
    return NextResponse.json({ id: form.id, slug: form.slug });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create PowerForm." },
      { status: 400 }
    );
  }
}
