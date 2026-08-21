import { NextResponse } from "next/server";
import {
  createSessionToken,
  sessionCookieName,
  sessionDurationSeconds,
} from "@/lib/auth";
import { addAuditEvent, getClientIpAddress, verifyLoginOtpChallenge } from "@/lib/store";

function cookieSecureFromRequest(requestUrl?: string) {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  if (requestUrl?.startsWith("https://")) return true;
  const appUrl = process.env.APP_URL || "";
  return appUrl.startsWith("https://");
}

export async function POST(request: Request) {
  let body: { challengeId?: string; otp?: string };
  try {
    body = (await request.json()) as { challengeId?: string; otp?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const challengeId = String(body.challengeId || "").trim();
  const otp = String(body.otp || "").trim().toUpperCase();
  if (!challengeId || !otp) {
    return NextResponse.json({ error: "Enter the verification code from your email." }, { status: 400 });
  }

  const result = await verifyLoginOtpChallenge({ challengeId, otp });
  if (!result.ok) {
    if (result.masterLogin) {
      try {
        await addAuditEvent({
          officeId: "system",
          envelopeId: "login",
          recipientId: null,
          type: "admin_master_login",
          message: `Master login OTP failed (challenge ${challengeId}): ${result.error}`,
          ipAddress: getClientIpAddress(request),
          userAgent: request.headers.get("user-agent"),
          metadata: {
            challengeId,
            success: false,
            phase: "otp_verify",
          },
        });
      } catch {
        /* ignore audit errors */
      }
    }
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  const { pendingSession, remember, masterLogin } = result.challenge;

  if (masterLogin) {
    try {
      await addAuditEvent({
        officeId: pendingSession.officeId || "system",
        envelopeId: "login",
        recipientId: null,
        type: "admin_master_login",
        message: `Master login success for ${pendingSession.email}`,
        ipAddress: getClientIpAddress(request),
        userAgent: request.headers.get("user-agent"),
        metadata: {
          targetUserId: pendingSession.userId,
          targetEmail: pendingSession.email,
          success: true,
          phase: "otp_verified",
        },
      });
    } catch (error) {
      console.error("[login/otp] master login audit failed:", error);
    }
  }

  const response = NextResponse.json({ success: true, role: pendingSession.role });
  response.cookies.set(
    sessionCookieName,
    createSessionToken({
      userId: pendingSession.userId,
      email: pendingSession.email,
      name: pendingSession.name,
      role: pendingSession.role,
      officeId: pendingSession.officeId,
    }),
    {
      httpOnly: true,
      secure: cookieSecureFromRequest(request.url),
      sameSite: "lax",
      path: "/",
      maxAge: remember ? 60 * 60 * 24 * 30 : sessionDurationSeconds,
    }
  );
  return response;
}
