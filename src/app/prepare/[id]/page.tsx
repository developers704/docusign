import { notFound } from "next/navigation";
import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireAdmin, canAccessOffice } from "@/lib/auth";
import { getEnvelopeById } from "@/lib/store";
import PrepareEditor from "@/components/PrepareEditor";

export default async function PrepareEnvelopePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  const { id } = await params;
  const envelope = await getEnvelopeById(id);
  if (!envelope || !canAccessOffice(session, envelope.officeId)) notFound();
  if (envelope.status !== "draft") notFound();
  const bytes = await readFile(path.join(process.cwd(), envelope.originalPdfPath));
  const pdf = await PDFDocument.load(bytes);
  const pageSizes = pdf.getPages().map((page) => ({ width: page.getWidth(), height: page.getHeight() }));
  return <PrepareEditor envelope={envelope} pageSizes={pageSizes} />;
}
