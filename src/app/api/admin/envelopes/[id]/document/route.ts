import path from "node:path";
import { NextResponse } from "next/server";
import { canAccessOffice, requireAdminApi } from "@/lib/auth";
import { servePdfFile } from "@/lib/pdfHttp";
import { getEnvelopeById } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pdfFileName(envelope: { originalFileName?: string | null; id: string; title?: string }) {
  const raw = envelope.originalFileName || `${envelope.title || envelope.id}.pdf`;
  const base = raw.replace(/[^\w.\- ()]+/g, "_").slice(0, 120);
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const { id } = await params;
  const envelope = await getEnvelopeById(id);
  if (!envelope || !canAccessOffice(session, envelope.officeId)) {
    return new NextResponse("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const storedPath = envelope.signedPdfPath || envelope.workingPdfPath || envelope.originalPdfPath;
  if (!storedPath) {
    return new NextResponse("Document file missing.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  try {
    const absolute = path.isAbsolute(storedPath) ? storedPath : path.join(process.cwd(), storedPath);
    return await servePdfFile(absolute, pdfFileName(envelope));
  } catch (error) {
    console.error("[envelope-document]", id, error);
    return new NextResponse("Document file could not be read.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
