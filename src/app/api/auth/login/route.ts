import { NextResponse } from "next/server";
import {
  createSessionToken,
  sessionCookieName,
  sessionDurationSeconds,
  verifyCredentials,
} from "@/lib/auth";

function cookieSecureFromRequest(requestUrl?: string) {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  if (requestUrl?.startsWith("https://")) return true;
  const appUrl = process.env.APP_URL || "";
  return appUrl.startsWith("https://");
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
  const response = NextResponse.json({ success: true, role: session.role });
  response.cookies.set(
    sessionCookieName,
    createSessionToken({
      userId: session.userId,
      email: session.email,
      name: session.name,
      role: session.role,
      officeId: session.officeId,
    }),
    {
      httpOnly: true,
      // HTTP IP/VPS: secure cookies would never save — only require secure on HTTPS.
      secure: cookieSecureFromRequest(request.url),
      sameSite: "lax",
      path: "/",
      maxAge: body.remember ? 60 * 60 * 24 * 30 : sessionDurationSeconds,
    }
  );
  return response;
}
