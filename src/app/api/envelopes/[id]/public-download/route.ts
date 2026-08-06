import { readFile } from "node:fs/promises";
import path from "node:path";
import { ensureEnvelopeCertificate } from "@/lib/pdf";
import { getEnvelopeById, readEnvelopes, writeEnvelopes } from "@/lib/store";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const envelope = await getEnvelopeById(id);
  const key = new URL(request.url).searchParams.get("key");
  if (!envelope) return new Response("Not found", { status: 404 });

  if (envelope.status === "completed") {
    try {
      const changed = await ensureEnvelopeCertificate(envelope);
      if (changed) {
        const envelopes = await readEnvelopes();
        const idx = envelopes.findIndex((item) => item.id === envelope.id);
        if (idx >= 0) {
          envelopes[idx] = envelope;
          await writeEnvelopes(envelopes);
        }
      }
    } catch (error) {
      console.error("public download: ensureEnvelopeCertificate failed", error);
    }
  }

  if (!envelope.signedPdfPath || !envelope.certificateId || key !== envelope.certificateId) {
    return new Response("Not found", { status: 404 });
  }

  const bytes = await readFile(path.join(process.cwd(), envelope.signedPdfPath));
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${envelope.title.replace(/[^a-z0-9_-]+/gi, "-")}-completed.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
