import { NextResponse } from "next/server";
import { canAccessOffice, canCreateEnvelopes, requireAdminApi } from "@/lib/auth";
import { addAuditEvent, readEnvelopes, writeEnvelopes } from "@/lib/store";
import { dispatchEnvelopeSend, scheduleEnvelopeSend } from "@/lib/services/envelopeSendService";
import { safeTimeZone } from "@/lib/timezone";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdminApi();
    if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    if (!canCreateEnvelopes(session)) {
      return NextResponse.json({ error: "Your role cannot send envelopes." }, { status: 403 });
    }
    const { id } = await params;
    const envelopes = await readEnvelopes();
    const index = envelopes.findIndex((item) => item.id === id);
    if (index < 0 || !canAccessOffice(session, envelopes[index].officeId)) {
      return NextResponse.json({ error: "Envelope not found." }, { status: 404 });
    }
    const envelope = envelopes[index];
    const body = (await request.json().catch(() => ({}))) as {
      scheduledSendAt?: string;
      scheduledTimezone?: string;
      cancelSchedule?: boolean;
    };

    if (body.cancelSchedule) {
      if (envelope.status !== "scheduled") {
        return NextResponse.json({ error: "This envelope is not scheduled." }, { status: 409 });
      }
      envelope.status = "draft";
      envelope.scheduledSendAt = null;
      envelope.scheduledTimezone = null;
      envelope.updatedAt = new Date().toISOString();
      await writeEnvelopes(envelopes);
      return NextResponse.json({ message: "Schedule cancelled. Envelope is a draft again." });
    }

    const scheduledSendAt = String(body.scheduledSendAt || "").trim();
    if (scheduledSendAt) {
      const scheduledTimezone = safeTimeZone(body.scheduledTimezone);
      const result = scheduleEnvelopeSend(envelope, scheduledSendAt, scheduledTimezone);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
      await addAuditEvent({
        officeId: envelope.officeId,
        envelopeId: envelope.id,
        recipientId: null,
        type: "envelope_sent",
        message: result.message || "Envelope scheduled.",
        ipAddress: null,
        userAgent: request.headers.get("user-agent"),
      });
      await writeEnvelopes(envelopes);
      return NextResponse.json({
        message: result.message,
        scheduled: true,
        scheduledSendAt: envelope.scheduledSendAt,
        scheduledTimezone: envelope.scheduledTimezone,
      });
    }

    const result = await dispatchEnvelopeSend(envelope, {
      userAgent: request.headers.get("user-agent"),
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });

    let bulkSent = 0;
    if (envelope.bulkBatchId) {
      const siblings = envelopes.filter(
        (item) =>
          item.id !== envelope.id &&
          item.bulkBatchId === envelope.bulkBatchId &&
          item.status === "draft" &&
          (item.fields || []).some((field) => field.type === "signature")
      );
      for (const sibling of siblings) {
        const siblingResult = await dispatchEnvelopeSend(sibling, {
          userAgent: request.headers.get("user-agent"),
        });
        if (siblingResult.ok) bulkSent += 1;
      }
    }

    await writeEnvelopes(envelopes);
    const message =
      bulkSent > 0
        ? `${result.message} Also sent ${bulkSent} other agreement${bulkSent === 1 ? "" : "s"} from this bulk send.`
        : result.message;
    return NextResponse.json({ message, scheduled: false, bulkSent });
  } catch (error) {
    console.error("Envelope send/schedule failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Schedule/send failed: ${error.message}`
            : "Schedule/send failed unexpectedly.",
      },
      { status: 500 }
    );
  }
}
