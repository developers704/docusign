import { readFile } from "node:fs/promises";

function safeFileName(fileName: string) {
  return (fileName || "document.pdf").replace(/"/g, "").replace(/[^\w.\- ()]+/g, "_").slice(0, 120);
}

function pdfHeaders(fileName: string, size: number, download = false): HeadersInit {
  return {
    "Content-Type": "application/pdf",
    "Content-Length": String(size),
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeFileName(fileName)}"`,
    "Cache-Control": "private, no-store, max-age=0",
    "Accept-Ranges": "none",
    "X-Content-Type-Options": "nosniff",
  };
}

/**
 * Serve a PDF from disk.
 * Use plain Response + Buffer (not NextResponse / streams) — Next App Router
 * has repeatedly produced empty bodies for PDF routes in this project.
 */
export async function servePdfFile(absolutePath: string, fileName: string, download = false) {
  const bytes = await readFile(absolutePath);
  if (!bytes.length) {
    return new Response("Document file is empty.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const body = Buffer.from(bytes);

  return new Response(body, {
    status: 200,
    headers: pdfHeaders(fileName, body.length, download),
  });
}

/** Serve in-memory PDF bytes (e.g. filtered signer pages). */
export function servePdfBytes(bytes: Buffer | Uint8Array, fileName: string, download = false) {
  if (!bytes.byteLength) {
    return new Response("Document file is empty.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const body = Buffer.from(bytes);

  return new Response(body, {
    status: 200,
    headers: pdfHeaders(fileName, body.length, download),
  });
}
