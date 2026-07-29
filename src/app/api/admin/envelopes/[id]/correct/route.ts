import { NextResponse } from "next/server";
import { canAccessOffice, canCreateEnvelopes, requireAdminApi } from "@/lib/auth";
import { addAuditEvent, readEnvelopes, writeEnvelopes } from "@/lib/store";
import { revokeRecipientToken } from "@/lib/services/envelopeWorkflowService";

const CORRECTABLE = new Set(["sent", "viewed", "scheduled"]);
const DONE = new Set(["signed", "completed", "approved", "acknowledged"]);

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!canCreateEnvelopes(session)) {
    return NextResponse.json({ error: "Your role cannot correct envelopes." }, { status: 403 });
  }

  const { id } = await params;
  const envelopes = await readEnvelopes();
  const envelope = envelopes.find((item) => item.id === id);
  if (!envelope || !canAccessOffice(session, envelope.officeId)) {
    return NextResponse.json({ error: "Envelope not found." }, { status: 404 });
  }
  if (!CORRECTABLE.has(envelope.status)) {
    return NextResponse.json(
      { error: "Only sent or in-progress envelopes can be corrected." },
      { status: 409 }
    );
  }

  const signedCount = envelope.recipients.filter((recipient) => DONE.has(recipient.status)).length;
  if (signedCount > 0) {
    return NextResponse.json(
      { error: "Someone has already signed. Void this envelope and send a new one instead." },
      { status: 409 }
    );
  }

  envelope.status = "draft";
  envelope.sentAt = null;
  envelope.scheduledSendAt = null;
  envelope.scheduledTimezone = null;
  envelope.updatedAt = new Date().toISOString();

  for (const recipient of envelope.recipients) {
    if (DONE.has(recipient.status)) continue;
    recipient.status = "pending";
    recipient.sentAt = null;
    recipient.viewedAt = null;
    recipient.activatedAt = null;
    revokeRecipientToken(recipient);
  }

  await writeEnvelopes(envelopes);
  await addAuditEvent({
    officeId: envelope.officeId,
    envelopeId: envelope.id,
    recipientId: null,
    type: "envelope_created",
    message: `${session.name} opened envelope for correction`,
    ipAddress: null,
    userAgent: _request.headers.get("user-agent"),
    metadata: { action: "correct" },
  });

  return NextResponse.json({ success: true, envelopeId: envelope.id });
}
