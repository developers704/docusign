import { NextResponse } from "next/server";
import { canAccessOffice, canCreateEnvelopes, requireAdminApi } from "@/lib/auth";
import { sendSignatureRequestEmail } from "@/lib/email";
import { addAuditEvent, readEnvelopes, writeEnvelopes } from "@/lib/store";
import { getActiveRecipients, issueRecipientSigningToken } from "@/lib/services/envelopeWorkflowService";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!canCreateEnvelopes(session)) return NextResponse.json({ error: "Your role cannot send reminders." }, { status: 403 });
  const { id } = await params;
  const envelopes = await readEnvelopes();
  const envelope = envelopes.find((item) => item.id === id);
  if (!envelope || !canAccessOffice(session, envelope.officeId)) return NextResponse.json({ error: "Envelope not found." }, { status: 404 });
  const activeRecipients = getActiveRecipients(envelope).filter((recipient) => !["declined", "completed"].includes(recipient.status));
  if (!activeRecipients.length) return NextResponse.json({ error: "No active recipient for reminder." }, { status: 409 });

  const errors: string[] = [];
  for (const recipient of activeRecipients) {
    if (["receives_copy", "view_only"].includes(recipient.recipientType || "signer")) continue;
    const rawToken = issueRecipientSigningToken(recipient);
    const result = await sendSignatureRequestEmail(envelope, recipient, rawToken, true);
    recipient.reminderCount = (recipient.reminderCount || 0) + 1;
    await addAuditEvent({
      officeId: envelope.officeId,
      envelopeId: envelope.id,
      recipientId: recipient.id,
      type: result.sent ? "reminder_sent" : "email_failed",
      message: result.sent ? `Reminder sent to ${recipient.email}` : `Reminder failed: ${result.reason}`,
      ipAddress: null,
      userAgent: request.headers.get("user-agent"),
    });
    if (!result.sent) errors.push(`${recipient.email}: ${result.reason || "failed"}`);
  }
  envelope.updatedAt = new Date().toISOString();
  await writeEnvelopes(envelopes);
  return errors.length
    ? NextResponse.json({ error: `Reminder partially failed: ${errors.join("; ")}` }, { status: 503 })
    : NextResponse.json({ message: "Reminder sent." });
}

