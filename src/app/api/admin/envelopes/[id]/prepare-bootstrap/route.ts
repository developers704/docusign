import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { canAccessOffice, requireAdminApi } from "@/lib/auth";
import { getEnvelopeById } from "@/lib/store";

/** Lightweight bootstrap for /prepare/[id] — avoids RSC streaming of the heavy prepare editor. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  const envelope = await getEnvelopeById(id);
  if (!envelope || !canAccessOffice(session, envelope.officeId)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (envelope.status !== "draft") {
    return NextResponse.json({ error: "Only draft envelopes can be prepared." }, { status: 409 });
  }

  let pageSizes: Array<{ width: number; height: number }> = [{ width: 612, height: 792 }];
  try {
    const bytes = await readFile(path.join(process.cwd(), envelope.originalPdfPath));
    const pdf = await PDFDocument.load(bytes);
    pageSizes = pdf.getPages().map((page) => ({
      width: page.getWidth(),
      height: page.getHeight(),
    }));
  } catch (error) {
    console.error("[prepare-bootstrap] PDF page sizes failed:", id, error);
  }

  return NextResponse.json({
    envelope: JSON.parse(JSON.stringify(envelope)),
    pageSizes,
  });
}
