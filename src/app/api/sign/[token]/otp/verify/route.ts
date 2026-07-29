import { NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/rateLimit";
import { addAuditEvent, findEnvelopeByToken, getClientIpAddress, hashToken, writeEnvelopes } from "@/lib/store";
import { workflowConfig } from "@/lib/workflowConfig";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ipAddress = getClientIpAddress(request);
  const limit = consumeRateLimit({
    key: `otp-verify:${ipAddress}`,
    windowSeconds: workflowConfig.signingRateLimitWindowSeconds,
    maxRequests: workflowConfig.signingRateLimitMaxRequests,
  });
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests. Please wait and retry." }, { status: 429 });

  const body = (await request.json().catch(() => ({} as { code?: string }))) as { code?: string };
  const code = String(body.code || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return NextResponse.json({ error: "Invalid verification code." }, { status: 400 });

  const found = await findEnvelopeByToken(token);
  if (!found) return NextResponse.json({ error: "Invalid verification code." }, { status: 404 });
  const now = Date.now();
  if (found.recipient.otpLockedUntil && new Date(found.recipient.otpLockedUntil).getTime() > now) {
    return NextResponse.json({ error: "Verification is temporarily locked. Please try again later." }, { status: 429 });
  }
  if (!found.recipient.otpHash || !found.recipient.otpExpiresAt || now > new Date(found.recipient.otpExpiresAt).getTime()) {
    return NextResponse.json({ error: "Verification code expired. Request a new code." }, { status: 410 });
  }

  const matches = found.recipient.otpHash === hashToken(code);
  if (!matches) {
    found.recipient.otpAttemptCount = (found.recipient.otpAttemptCount || 0) + 1;
    if (found.recipient.otpAttemptCount >= workflowConfig.otpMaxAttempts) {
      found.recipient.otpLockedUntil = new Date(now + workflowConfig.otpLockoutMinutes * 60 * 1000).toISOString();
      await addAuditEvent({
        officeId: found.envelope.officeId,
        envelopeId: found.envelope.id,
        recipientId: found.recipient.id,
        type: "otp_locked",
        message: "OTP verification locked due to too many failed attempts.",
        ipAddress,
        userAgent: request.headers.get("user-agent"),
      });
    }
    await writeEnvelopes(found.envelopes);
    await addAuditEvent({
      officeId: found.envelope.officeId,
      envelopeId: found.envelope.id,
      recipientId: found.recipient.id,
      type: "otp_failed",
      message: "Invalid OTP verification attempt.",
      ipAddress,
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.json({ error: "Invalid verification code." }, { status: 400 });
  }

  found.recipient.otpVerifiedAt = new Date().toISOString();
  found.recipient.otpAttemptCount = 0;
  found.recipient.otpLockedUntil = null;
  await writeEnvelopes(found.envelopes);
  await addAuditEvent({
    officeId: found.envelope.officeId,
    envelopeId: found.envelope.id,
    recipientId: found.recipient.id,
    type: "otp_verified",
    message: "OTP verification completed.",
    ipAddress,
    userAgent: request.headers.get("user-agent"),
  });
  return NextResponse.json({ success: true });
}

