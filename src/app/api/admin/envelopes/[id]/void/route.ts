import { NextResponse } from "next/server";
import { canAccessOffice, canCreateEnvelopes, requireAdminApi } from "@/lib/auth";
import { addAuditEvent, readEnvelopes, writeEnvelopes } from "@/lib/store";
import { revokeRecipientToken } from "@/lib/services/envelopeWorkflowService";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!canCreateEnvelopes(session)) return NextResponse.json({ error: "Your role cannot void envelopes." }, { status: 403 });
  const { id } = await params;
  const body = (await request.json()) as { reason?: string };
  const reason = String(body.reason || "").trim();
  if (!reason) return NextResponse.json({ error: "A void reason is required." }, { status: 400 });
  const envelopes = await readEnvelopes();
  const envelope = envelopes.find((item) => item.id === id);
  if (!envelope || !canAccessOffice(session, envelope.officeId)) return NextResponse.json({ error: "Envelope not found." }, { status: 404 });
  if (envelope.status === "completed") return NextResponse.json({ error: "A completed envelope cannot be voided." }, { status: 409 });
  envelope.status = "voided";
  envelope.voidedAt = new Date().toISOString();
  envelope.voidReason = reason;
  for (const recipient of envelope.recipients) {
    revokeRecipientToken(recipient);
    await addAuditEvent({
      officeId: envelope.officeId,
      envelopeId: envelope.id,
      recipientId: recipient.id,
      type: "token_revoked",
      message: `Signing token revoked after envelope void.`,
      ipAddress: null,
      userAgent: request.headers.get("user-agent"),
    });
  }
  envelope.updatedAt = envelope.voidedAt;
  await writeEnvelopes(envelopes);
  await addAuditEvent({ officeId: envelope.officeId, envelopeId: id, recipientId: null, type: "envelope_voided", message: `Envelope voided by ${session.email}: ${reason}`, ipAddress: null, userAgent: request.headers.get("user-agent") });
  return NextResponse.json({ message: "Envelope voided." });
}
