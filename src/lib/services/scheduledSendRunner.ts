import { addAuditEvent, readEnvelopes, writeEnvelopes } from "@/lib/store";
import { dispatchEnvelopeSend } from "@/lib/services/envelopeSendService";

let running = false;
const inflight = new Set<string>();

/** Finds due scheduled envelopes and sends them. Safe to call repeatedly. */
export async function processDueScheduledSends() {
  if (running) return { processed: 0, failed: 0 };
  running = true;

  try {
    const envelopes = await readEnvelopes();
    const now = Date.now();
    let processed = 0;
    let failed = 0;
    let changed = false;

    for (const envelope of envelopes) {
      if (envelope.status !== "scheduled" || !envelope.scheduledSendAt) continue;
      if (inflight.has(envelope.id)) continue;
      const dueAt = new Date(envelope.scheduledSendAt).getTime();
      if (!Number.isFinite(dueAt) || dueAt > now) continue;

      inflight.add(envelope.id);
      try {
        const result = await dispatchEnvelopeSend(envelope, { fromSchedule: true, userAgent: "scheduler" });
        changed = true;
        if (result.ok) {
          processed += 1;
          await addAuditEvent({
            officeId: envelope.officeId,
            envelopeId: envelope.id,
            recipientId: null,
            type: "envelope_sent",
            message: result.message || "Scheduled send completed.",
            ipAddress: null,
            userAgent: "scheduler",
          });
        } else {
          failed += 1;
          envelope.status = "draft";
          envelope.scheduledSendAt = null;
          envelope.scheduledTimezone = null;
          envelope.updatedAt = new Date().toISOString();
          await addAuditEvent({
            officeId: envelope.officeId,
            envelopeId: envelope.id,
            recipientId: null,
            type: "email_failed",
            message: `Scheduled send failed: ${result.error || "unknown error"}`,
            ipAddress: null,
            userAgent: "scheduler",
          });
        }
      } finally {
        inflight.delete(envelope.id);
      }
    }

    if (changed) await writeEnvelopes(envelopes);
    return { processed, failed };
  } finally {
    running = false;
  }
}
