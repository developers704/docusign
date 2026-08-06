import { readFile } from "node:fs/promises";
import path from "node:path";
import { ensureEnvelopeCertificate } from "@/lib/pdf";
import { findEnvelopeByToken, isEnvelopeExpired, writeEnvelopes } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeName(value: string) {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "document";
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await findEnvelopeByToken(token);
  if (!found) return new Response("Document not found", { status: 404 });

  const { envelope, recipient } = found;
  if (isEnvelopeExpired(envelope) || envelope.status === "voided") {
    return new Response("This envelope is unavailable", { status: 410 });
  }

  const type = new URL(request.url).searchParams.get("type") || "signed";
  let storedPath: string | null | undefined;
  let filename: string;

  if (type === "original") {
    storedPath = envelope.originalPdfPath;
    filename = `${safeName(envelope.title)}-original.pdf`;
  } else {
    // Repair completed envelopes that were saved without a certificate page (VM finalize failures).
    if (envelope.status === "completed") {
      try {
        const changed = await ensureEnvelopeCertificate(envelope);
        if (changed) await writeEnvelopes(found.envelopes);
      } catch (error) {
        console.error("sign download: ensureEnvelopeCertificate failed", error);
      }
    }
    storedPath = envelope.signedPdfPath || envelope.workingPdfPath;
    filename = `${safeName(envelope.title)}-${envelope.signedPdfPath ? "completed" : "signed"}.pdf`;
    if (!storedPath) {
      return new Response("Signed PDF is not ready yet.", { status: 404 });
    }
  }

  if (!storedPath) return new Response("Document file missing.", { status: 404 });

  // Recipients may download after they have acted, or while they are the active signer.
  const acted = ["signed", "approved", "acknowledged", "completed"].includes(recipient.status);
  const active = ["active", "viewed", "sent"].includes(recipient.status);
  if (!acted && !active && envelope.status !== "completed") {
    return new Response("You are not authorized to download this document.", { status: 403 });
  }

  try {
    const absolute = path.isAbsolute(storedPath) ? storedPath : path.join(process.cwd(), storedPath);
    const bytes = await readFile(absolute);
    if (!bytes.length) return new Response("Document file is empty.", { status: 404 });
    const body = Buffer.from(bytes);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(body.length),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("Document file could not be read.", { status: 404 });
  }
}
