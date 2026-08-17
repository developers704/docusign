import { NextResponse } from "next/server";
import {
  createSessionToken,
  sessionCookieName,
  sessionDurationSeconds,
  verifyCredentials,
} from "@/lib/auth";
import { sendLoginOtpEmail } from "@/lib/email";
import { createLoginOtpChallenge, createSecureToken, getOfficeById } from "@/lib/store";

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
