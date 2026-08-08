import { NextResponse } from "next/server";
import { canAccessOffice, requireAdminApi } from "@/lib/auth";
import { isEmailConfigured, sendSmtpTestEmail } from "@/lib/smtp";

export async function POST(request: Request) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (session.role === "viewer") return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { to?: string; officeId?: string };
  const to = String(body.to || session.email || "").trim();
  const officeId = String(body.officeId || "").trim() || null;
  if (!to || !to.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (officeId && !canAccessOffice(session, officeId)) {
    return NextResponse.json({ error: "Not allowed for this office." }, { status: 403 });
  }
  if (!(await isEmailConfigured(officeId))) {
    return NextResponse.json({ error: "SMTP is not configured on this server." }, { status: 400 });
  }

  const result = await sendSmtpTestEmail(to, officeId);
  if (!result.sent) {
    return NextResponse.json({ error: result.reason || "SMTP test failed." }, { status: 502 });
  }
  return NextResponse.json({
    message: `Test email sent to ${to}. Check inbox and spam/junk folder.`,
    detail: result.reason || null,
  });
}
