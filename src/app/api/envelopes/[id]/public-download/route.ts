import { readFile } from "node:fs/promises";
import path from "node:path";
import { getEnvelopeById } from "@/lib/store";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const envelope = await getEnvelopeById(id);
  const key = new URL(request.url).searchParams.get("key");
  if (!envelope || !envelope.signedPdfPath || !envelope.certificateId || key !== envelope.certificateId) return new Response("Not found", { status: 404 });
  const bytes = await readFile(path.join(process.cwd(), envelope.signedPdfPath));
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${envelope.title.replace(/[^a-z0-9_-]+/gi, "-")}-completed.pdf"`, "Cache-Control": "private, no-store" } });
}
