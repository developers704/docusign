import { readFile } from "node:fs/promises";
import path from "node:path";
import { canAccessOffice, requireAdminApi } from "@/lib/auth";
import { ensureEnvelopeCertificate } from "@/lib/pdf";
import { addAuditEvent, getEnvelopeById, readEnvelopes, writeEnvelopes } from "@/lib/store";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  let envelope = await getEnvelopeById(id);
  if (!envelope || !canAccessOffice(session, envelope.officeId)) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const type = url.searchParams.get("type") === "signed" ? "signed" : "original";

  if (type === "signed" && envelope.status === "completed" && (!envelope.signedPdfPath || !envelope.certificateId)) {
    try {
      const envelopes = await readEnvelopes();
      const target = envelopes.find((item) => item.id === id);
      if (target) {
        const changed = await ensureEnvelopeCertificate(target);
        if (changed) {
          await writeEnvelopes(envelopes);
          envelope = target;
        }
      }
    } catch (error) {
      console.error("admin download: ensureEnvelopeCertificate failed", error);
    }
  }

  const storedPath = type === "signed" ? envelope.signedPdfPath : envelope.originalPdfPath;
  if (!storedPath) return new Response("Not found", { status: 404 });
  const bytes = await readFile(path.join(process.cwd(), storedPath));
  await addAuditEvent({
    officeId: envelope.officeId,
    envelopeId: envelope.id,
    recipientId: null,
    type: "document_downloaded",
    message: `${session.email} downloaded the ${type} document`,
    ipAddress: null,
    userAgent: request.headers.get("user-agent"),
  });
  const suffix = type === "signed" ? "-signed" : "-original";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${envelope.title.replace(/[^a-z0-9_-]+/gi, "-")}${suffix}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
