import { NextResponse } from "next/server";
import { canAccessOffice, requireAdmin } from "@/lib/auth";
import { deleteWebForm } from "@/lib/services/publishedFormService";
import { readWebForms } from "@/lib/store";

export const runtime = "nodejs";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdmin();
    if (session.role === "viewer") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    const { id } = await context.params;
    const forms = await readWebForms();
    const existing = forms.find((form) => form.id === id);
    if (!existing || !canAccessOffice(session, existing.officeId)) {
      return NextResponse.json({ error: "Web Form not found." }, { status: 404 });
    }
    await deleteWebForm(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete Web Form." },
      { status: 400 }
    );
  }
}
