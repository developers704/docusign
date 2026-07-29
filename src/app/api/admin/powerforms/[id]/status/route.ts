import { NextResponse } from "next/server";
import { canAccessOffice, requireAdmin } from "@/lib/auth";
import { getPowerFormById, setPowerFormStatus } from "@/lib/services/powerFormService";
import type { PowerFormStatus } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
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
    const body = (await request.json()) as { status?: PowerFormStatus };
    if (!body.status) return NextResponse.json({ error: "Status is required." }, { status: 400 });
    const form = await setPowerFormStatus(id, body.status, { userId: session.userId, email: session.email });
    return NextResponse.json({ id: form.id, status: form.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update status." },
      { status: 400 }
    );
  }
}
