import { NextResponse } from "next/server";
import { canAccessOffice, requireAdmin } from "@/lib/auth";
import { getPowerFormById, updatePowerForm } from "@/lib/services/powerFormService";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
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
    const body = (await request.json()) as Record<string, unknown>;
    const form = await updatePowerForm(
      id,
      {
        name: body.name !== undefined ? String(body.name) : existing.name,
        slug: body.slug !== undefined ? String(body.slug) : existing.slug,
        description: body.description !== undefined ? String(body.description) : existing.description,
        accessType: (body.accessType as typeof existing.accessType) || existing.accessType,
        accessCode: body.accessCode ? String(body.accessCode) : undefined,
        collectName: body.collectName !== undefined ? Boolean(body.collectName) : existing.collectName,
        collectEmail: body.collectEmail !== undefined ? Boolean(body.collectEmail) : existing.collectEmail,
        collectPhone: body.collectPhone !== undefined ? Boolean(body.collectPhone) : existing.collectPhone,
        collectEmployeeId:
          body.collectEmployeeId !== undefined ? Boolean(body.collectEmployeeId) : existing.collectEmployeeId,
        requireConsent: body.requireConsent !== undefined ? Boolean(body.requireConsent) : existing.requireConsent,
        consentText: body.consentText !== undefined ? String(body.consentText) : existing.consentText,
        successMessage: body.successMessage !== undefined ? String(body.successMessage) : existing.successMessage,
        submissionLimit:
          body.submissionLimit === undefined
            ? existing.submissionLimit
            : body.submissionLimit === null || body.submissionLimit === ""
              ? null
              : Number(body.submissionLimit),
        customIntakeFields: Array.isArray(body.customIntakeFields)
          ? (body.customIntakeFields as typeof existing.customIntakeFields)
          : existing.customIntakeFields,
        status: body.publish ? "published" : existing.status,
        requireAccessCode:
          ((body.accessType as string) || existing.accessType) === "access_code" || existing.requireAccessCode,
        requireEmailVerification:
          ((body.accessType as string) || existing.accessType) === "email_verified" ||
          existing.requireEmailVerification,
        publishedAt: body.publish ? existing.publishedAt || new Date().toISOString() : existing.publishedAt,
      },
      { userId: session.userId, email: session.email }
    );
    return NextResponse.json({ id: form.id, slug: form.slug });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update PowerForm." },
      { status: 400 }
    );
  }
}
