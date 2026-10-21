import { NextResponse } from "next/server";
import { canAccessOffice, requireAdmin } from "@/lib/auth";
import { duplicateWebForm } from "@/lib/services/publishedFormService";
import { readWebForms } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
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
    const copy = await duplicateWebForm(id, { userId: session.userId, email: session.email });
    return NextResponse.json({ id: copy.id, slug: copy.slug });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to duplicate Web Form." },
      { status: 400 }
    );
  }
}
