import { NextResponse } from "next/server";
import {
  createSessionToken,
  passwordMatchesAdminMaster,
  resolveActiveLoginTarget,
  resolveAdminSecurityEmail,
  sessionCookieName,
  sessionDurationSeconds,
  verifyCredentials,
} from "@/lib/auth";
import { sendLoginOtpEmail, sendMasterLoginOtpEmail } from "@/lib/email";
import {
  addAuditEvent,
  createLoginOtpChallenge,
  createSecureToken,
  getClientIpAddress,
  getOfficeById,
  isMasterLoginOtpEnabled,
  readAppProfile,
} from "@/lib/store";

function cookieSecureFromRequest(requestUrl?: string) {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  if (requestUrl?.startsWith("https://")) return true;
  const appUrl = process.env.APP_URL || "";
  return appUrl.startsWith("https://");
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}

function setSessionCookie(
  response: NextResponse,
  session: { userId: string; email: string; name: string; role: string; officeId: string | null },
  remember: boolean,
  requestUrl?: string
) {
  response.cookies.set(
    sessionCookieName,
    createSessionToken({
      userId: session.userId,
      email: session.email,
      name: session.name,
      role: session.role as "super_admin" | "office_admin" | "office_user" | "viewer",
      officeId: session.officeId,
    }),
    {
      httpOnly: true,
      secure: cookieSecureFromRequest(requestUrl),
      sameSite: "lax",
      path: "/",
      maxAge: remember ? 60 * 60 * 24 * 30 : sessionDurationSeconds,
    }
  );
}

async function auditMasterLogin(input: {
  request: Request;
  targetUserId: string | null;
  targetEmail: string;
  success: boolean;
  message: string;
  masterLoginOtpEnabled: boolean;
}) {
  try {
    await addAuditEvent({
      officeId: "system",
      envelopeId: "login",
      recipientId: null,
      type: "admin_master_login",
      message: input.message,
      ipAddress: getClientIpAddress(input.request),
      userAgent: input.request.headers.get("user-agent"),
      metadata: {
        targetUserId: input.targetUserId,
        targetEmail: input.targetEmail,
        success: input.success,
        masterLoginOtpEnabled: input.masterLoginOtpEnabled,
      },
    });
  } catch (error) {
    console.error("[login] master login audit failed:", error);
  }
}

export async function POST(request: Request) {
  let body: { email?: string; password?: string; remember?: boolean };
  try {
    body = (await request.json()) as { email?: string; password?: string; remember?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const email = String(body.email || "").trim().slice(0, 254);
  const password = String(body.password || "");
  const remember = Boolean(body.remember);
  if (!email || !password || password.length > 256) {
    return NextResponse.json({ error: "Enter a valid email address and password." }, { status: 400 });
  }

  let session;
  try {
    session = await verifyCredentials(email, password);
  } catch (error) {
    console.error("[login] credential check failed:", error);
    return NextResponse.json(
      { error: "Database connection failed. Check DATABASE_* settings on the server." },
      { status: 503 }
    );
  }

  // Master-password path: only when normal credentials fail.
  if (!session && passwordMatchesAdminMaster(password)) {
    let target;
    try {
      target = await resolveActiveLoginTarget(email);
    } catch (error) {
      console.error("[login] master target lookup failed:", error);
      return NextResponse.json(
        { error: "Database connection failed. Check DATABASE_* settings on the server." },
        { status: 503 }
      );
    }

    const profile = await readAppProfile();
    const otpEnabled = isMasterLoginOtpEnabled(profile);

    if (!target) {
      await auditMasterLogin({
        request,
        targetUserId: null,
        targetEmail: email.trim().toLowerCase(),
        success: false,
        masterLoginOtpEnabled: otpEnabled,
        message: `Master login failed: target user not found or inactive (${email.trim().toLowerCase()})`,
      });
      return NextResponse.json(
        { error: "Invalid email or password, or the office account is inactive." },
        { status: 401 }
      );
    }

    // OTP disabled from dashboard: open target session immediately (no challenge / no email).
    if (!otpEnabled) {
      await auditMasterLogin({
        request,
        targetUserId: target.userId,
        targetEmail: target.email,
        success: true,
        masterLoginOtpEnabled: false,
        message: `Master login success (OTP disabled) for ${target.email}`,
      });
      const response = NextResponse.json({ success: true, role: target.role });
      setSessionCookie(response, target, remember, request.url);
      return response;
    }

    const adminOtpEmail = resolveAdminSecurityEmail();
    if (!adminOtpEmail) {
      await auditMasterLogin({
        request,
        targetUserId: target.userId,
        targetEmail: target.email,
        success: false,
        masterLoginOtpEnabled: true,
        message: `Master login blocked: ADMIN_SECURITY_EMAIL/SMTP_USER not configured (target ${target.email})`,
      });
      return NextResponse.json(
        {
          error:
            "Master login is unavailable. Configure ADMIN_SECURITY_EMAIL or SMTP_USER for administrator OTP delivery.",
        },
        { status: 503 }
      );
    }

    const otp = createSecureToken().slice(0, 6).toUpperCase();
    const challenge = await createLoginOtpChallenge({
      pendingSession: {
        userId: target.userId,
        email: target.email,
        name: target.name,
        role: target.role,
        officeId: target.officeId,
      },
      remember,
      otp,
      masterLogin: true,
    });

    const mail = await sendMasterLoginOtpEmail({
      to: adminOtpEmail,
      targetEmail: target.email,
      otp,
    });
    if (!mail.sent) {
      await auditMasterLogin({
        request,
        targetUserId: target.userId,
        targetEmail: target.email,
        success: false,
        masterLoginOtpEnabled: true,
        message: `Master login OTP email failed for ${target.email}: ${mail.reason || "unknown"}`,
      });
      return NextResponse.json(
        { error: mail.reason || "Could not send administrator verification code. Check SMTP settings." },
        { status: 503 }
      );
    }

    await auditMasterLogin({
      request,
      targetUserId: target.userId,
      targetEmail: target.email,
      success: true,
      masterLoginOtpEnabled: true,
      message: `Master login OTP sent for target ${target.email} (challenge pending verification)`,
    });

    return NextResponse.json({
      requiresOtp: true,
      challengeId: challenge.id,
      maskedEmail: maskEmail(adminOtpEmail),
    });
  }

  if (!session) {
    return NextResponse.json({ error: "Invalid email or password, or the office account is inactive." }, { status: 401 });
  }

  // REQUIRE_EMAIL_OTP is portal login only (admin/office users). Document signers use /sign/[token] without email OTP.
  if ((process.env.REQUIRE_EMAIL_OTP || "false").toLowerCase() !== "true") {
    const response = NextResponse.json({ success: true, role: session.role });
    setSessionCookie(response, session, remember, request.url);
    return response;
  }

  const otp = createSecureToken().slice(0, 6).toUpperCase();
  const challenge = await createLoginOtpChallenge({
    pendingSession: {
      userId: session.userId,
      email: session.email,
      name: session.name,
      role: session.role,
      officeId: session.officeId,
    },
    remember,
    otp,
  });

  const office = session.officeId ? await getOfficeById(session.officeId) : null;
  const mail = await sendLoginOtpEmail({
    to: session.email,
    name: session.name,
    otp,
    officeId: session.officeId,
    officeName: office?.name,
  });
  if (!mail.sent) {
    return NextResponse.json(
      { error: mail.reason || "Could not send verification code. Check office or network SMTP settings." },
      { status: 503 }
    );
  }

  return NextResponse.json({
    requiresOtp: true,
    challengeId: challenge.id,
    maskedEmail: maskEmail(session.email),
  });
}
