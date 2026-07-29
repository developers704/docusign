import { NextResponse } from "next/server";
import { canAccessOffice, requireAdminApi } from "@/lib/auth";
import { getEnvelopeById } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * cPanel-safe agreement opener: relative Location so the browser stays on the
 * public domain (never follows an internal https://0.0.0.0:PORT redirect).
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) {
    return new NextResponse(null, { status: 303, headers: { Location: "/login", "Cache-Control": "no-store" } });
  }

  const { id } = await context.params;
  const envelopeId = String(id || "").trim();
  if (!envelopeId) {
    return new NextResponse(null, { status: 303, headers: { Location: "/agreements", "Cache-Control": "no-store" } });
  }

  try {
    const envelope = await getEnvelopeById(envelopeId);
    if (envelope && canAccessOffice(session, envelope.officeId)) {
      return new NextResponse(null, {
        status: 303,
        headers: { Location: `/envelopes/${envelope.id}`, "Cache-Control": "no-store" },
      });
    }
  } catch (error) {
    console.error("[open-envelope]", envelopeId, error);
  }

  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/agreements?missing=${encodeURIComponent(envelopeId)}`, "Cache-Control": "no-store" },
  });
}
