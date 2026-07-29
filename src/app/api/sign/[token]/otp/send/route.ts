import { NextResponse } from "next/server";
import { sendOtpEmail } from "@/lib/email";
import { consumeRateLimit } from "@/lib/rateLimit";
import { addAuditEvent, createSecureToken, findEnvelopeByToken, getClientIpAddress, hashToken, writeEnvelopes } from "@/lib/store";
import { workflowConfig } from "@/lib/workflowConfig";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ipAddress = getClientIpAddress(request);
  const limit = consumeRateLimit({
    key: `otp-send:${ipAddress}`,
    windowSeconds: workflowConfig.signingRateLimitWindowSeconds,
    maxRequests: workflowConfig.signingRateLimitMaxRequests,
  });
  if (!limit.allowed) return NextResponse.json({ error: "Request limit reached. Please wait and retry." }, { status: 429 });

  const found = await findEnvelopeByToken(token);
  if (!found) return NextResponse.json({ error: "Unable to process this request." }, { status: 404 });
  const now = Date.now();
  const lockedUntilMs = found.recipient.otpLockedUntil ? new Date(found.recipient.otpLockedUntil).getTime() : 0;
  if (lockedUntilMs > now) return NextResponse.json({ error: "Unable to process this request." }, { status: 429 });
  const lastSentMs = found.recipient.otpLastSentAt ? new Date(found.recipient.otpLastSentAt).getTime() : 0;
  const cooldownMs = workflowConfig.otpResendCooldownSeconds * 1000;
  if (lastSentMs && now - lastSentMs < cooldownMs) {
    return NextResponse.json({ error: "Please wait before requesting another code." }, { status: 429 });
  }

  const otp = createSecureToken().slice(0, 6).toUpperCase();
  const expiresAt = new Date(now + workflowConfig.otpTtlMinutes * 60 * 1000).toISOString();
  found.recipient.otpHash = hashToken(otp);
  found.recipient.otpExpiresAt = expiresAt;
  found.recipient.otpVerifiedAt = null;
  found.recipient.otpAttemptCount = 0;
  found.recipient.otpLockedUntil = null;
  found.recipient.otpLastSentAt = new Date(now).toISOString();

  await writeEnvelopes(found.envelopes);
  const result = await sendOtpEmail(found.envelope, found.recipient, otp);
  await addAuditEvent({
    officeId: found.envelope.officeId,
    envelopeId: found.envelope.id,
    recipientId: found.recipient.id,
    type: result.sent ? "otp_sent" : "email_failed",
    message: result.sent ? "Verification code sent." : "Verification email delivery failed.",
    ipAddress,
    userAgent: request.headers.get("user-agent"),
  });
  return NextResponse.json(result.sent ? { success: true } : { error: "Unable to process this request." }, { status: result.sent ? 200 : 503 });
}

