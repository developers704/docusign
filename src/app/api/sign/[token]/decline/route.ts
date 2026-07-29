import { NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/rateLimit";
import { addAuditEvent, findEnvelopeByToken, getClientIpAddress, writeEnvelopes } from "@/lib/store";
import { workflowConfig } from "@/lib/workflowConfig";
import { canRecipientAct, revokeRecipientToken } from "@/lib/services/envelopeWorkflowService";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const ip = getClientIpAddress(request);
  const limit = consumeRateLimit({
    key: `sign-decline:${ip}`,
    windowSeconds: workflowConfig.signingRateLimitWindowSeconds,
    maxRequests: workflowConfig.signingRateLimitMaxRequests,
  });
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests. Please wait and retry." }, { status: 429 });

  const { token } = await params;
  const reason = String((await request.json().catch(() => ({} as { reason?: string }))).reason || "").trim();
  const found = await findEnvelopeByToken(token);
  if (!found) return NextResponse.json({ error: "Signing request not found." }, { status: 404 });
  if (!canRecipientAct(found.envelope, found.recipient)) return NextResponse.json({ error: "This recipient step is not active." }, { status: 409 });

  const now = new Date().toISOString();
  found.recipient.status = "declined";
  found.recipient.declinedAt = now;
  found.recipient.declineReason = reason || null;
  revokeRecipientToken(found.recipient);
  if (found.envelope.declineBehavior !== "continue_optional_only") {
    found.envelope.status = "declined";
  }
  found.envelope.updatedAt = now;
  await writeEnvelopes(found.envelopes);
  await addAuditEvent({
    officeId: found.envelope.officeId,
    envelopeId: found.envelope.id,
    recipientId: found.recipient.id,
    type: "recipient_declined",
    message: `${found.recipient.name} declined the envelope.`,
    ipAddress: ip,
    userAgent: request.headers.get("user-agent"),
  });
  await addAuditEvent({
    officeId: found.envelope.officeId,
    envelopeId: found.envelope.id,
    recipientId: found.recipient.id,
    type: "token_revoked",
    message: "Signing token revoked after decline.",
    ipAddress: null,
    userAgent: null,
  });
  return NextResponse.json({ success: true });
}

