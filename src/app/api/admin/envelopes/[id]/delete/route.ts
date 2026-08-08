import { unlink } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { canAccessOffice, canDeleteAgreements, requireAdminApi } from "@/lib/auth";
import { addAuditEvent, readEnvelopes, writeEnvelopes } from "@/lib/store";
import { revokeRecipientToken } from "@/lib/services/envelopeWorkflowService";

async function removeStoredFile(storedPath: string | null | undefined) {
  if (!storedPath) return;
  try {
    await unlink(path.join(process.cwd(), storedPath));
  } catch {
    // File may already be missing; continue deleting the agreement record.
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!canDeleteAgreements(session)) {
    return NextResponse.json({ error: "Only admins can delete contracts." }, { status: 403 });
  }

  const { id } = await params;
  const envelopes = await readEnvelopes();
  const envelope = envelopes.find((item) => item.id === id);
  if (!envelope || !canAccessOffice(session, envelope.officeId)) {
    return NextResponse.json({ error: "Contract not found." }, { status: 404 });
  }

  for (const recipient of envelope.recipients) {
    revokeRecipientToken(recipient);
  }

  await removeStoredFile(envelope.originalPdfPath);
  await removeStoredFile(envelope.workingPdfPath);
  await removeStoredFile(envelope.signedPdfPath);

  await writeEnvelopes(envelopes.filter((item) => item.id !== id));
  await addAuditEvent({
    officeId: envelope.officeId,
    envelopeId: id,
    recipientId: null,
    type: "envelope_deleted",
    message: `Contract deleted by ${session.email}: ${envelope.title} (${envelope.envelopeNumber})`,
    ipAddress: null,
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ message: "Contract deleted." });
}
