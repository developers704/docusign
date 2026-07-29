import type { EnvelopeRecord } from "@/lib/types";
import { sendSignatureRequestEmail, sendSignerQueuedEmail } from "@/lib/email";
import { addAuditEvent } from "@/lib/store";
import { workflowConfig } from "@/lib/workflowConfig";
import { formatScheduleDisplay, safeTimeZone } from "@/lib/timezone";
import {
  activateNextRecipients,
  auditStepActivation,
  detectWorkflowIssues,
  issueRecipientSigningToken,
  normalizeWorkflow,
} from "@/lib/services/envelopeWorkflowService";

export type SendEnvelopeResult = {
  ok: boolean;
  error?: string;
  message?: string;
  scheduled?: boolean;
};

function validateReadyToSend(envelope: EnvelopeRecord): string | null {
  if (["completed", "voided", "declined", "expired"].includes(envelope.status)) {
    return "This envelope cannot be sent.";
  }
  normalizeWorkflow(envelope);
  const fields = envelope.fields || [];
  if (!envelope.preparedAt || fields.length === 0) {
    return "Prepare the document and place signing fields before sending.";
  }
  if (!envelope.recipients.some((recipient) => !["receives_copy", "view_only"].includes(recipient.recipientType || "signer"))) {
    return "At least one actionable recipient is required.";
  }
  const workflowIssues = detectWorkflowIssues(envelope);
  if (workflowIssues.length) return workflowIssues[0];
  const firstStepCount = envelope.recipients.filter((recipient) => (recipient.signingStep || recipient.order) === 1).length;
  if (firstStepCount > workflowConfig.maxRecipientsPerSigningStep) {
    return `Step 1 exceeds max recipients per signing step (${workflowConfig.maxRecipientsPerSigningStep}).`;
  }
  for (const recipient of envelope.recipients.filter((item) => !["receives_copy", "view_only"].includes(item.recipientType || "signer"))) {
    if (!fields.some((field) => field.recipientId === recipient.id && field.type === "signature")) {
      return `Add a signature field for ${recipient.name}.`;
    }
  }
  return null;
}

/** Marks envelope as scheduled without emailing yet. */
export function scheduleEnvelopeSend(
  envelope: EnvelopeRecord,
  scheduledSendAtIso: string,
  scheduledTimezone?: string | null
): SendEnvelopeResult {
  const readyError = validateReadyToSend(envelope);
  if (readyError) return { ok: false, error: readyError };
  const when = new Date(scheduledSendAtIso);
  if (!Number.isFinite(when.getTime())) return { ok: false, error: "Invalid schedule date/time." };
  if (when.getTime() <= Date.now() + 30_000) {
    return { ok: false, error: "Choose a time at least 1 minute in the future, or send now." };
  }
  const zone = safeTimeZone(scheduledTimezone);
  envelope.scheduledSendAt = when.toISOString();
  envelope.scheduledTimezone = zone;
  envelope.status = "scheduled";
  envelope.updatedAt = new Date().toISOString();

  let display: string;
  try {
    display = formatScheduleDisplay(when, zone);
  } catch {
    display = when.toISOString();
  }

  return {
    ok: true,
    scheduled: true,
    message: `Envelope scheduled for ${display}.`,
  };
}

/** Sends invitations immediately (also used by the scheduler). */
export async function dispatchEnvelopeSend(
  envelope: EnvelopeRecord,
  options?: { userAgent?: string | null; fromSchedule?: boolean }
): Promise<SendEnvelopeResult> {
  const readyError = validateReadyToSend(envelope);
  if (readyError) return { ok: false, error: readyError };

  const activated = activateNextRecipients(envelope);
  if (!activated.length) return { ok: false, error: "No active recipient could be determined." };
  await auditStepActivation(envelope, activated);

  const activatedIds = new Set(activated.map((recipient) => recipient.id));
  const warnings: string[] = [];

  for (const recipient of activated) {
    const rawToken = issueRecipientSigningToken(recipient);
    recipient.sentAt = new Date().toISOString();
    const result = await sendSignatureRequestEmail(envelope, recipient, rawToken);
    await addAuditEvent({
      officeId: envelope.officeId,
      envelopeId: envelope.id,
      recipientId: recipient.id,
      type: result.sent ? "email_sent" : "email_failed",
      message: result.sent ? `Signing invitation emailed to ${recipient.email}` : `Email failed: ${result.reason}`,
      ipAddress: null,
      userAgent: options?.userAgent || null,
    });
    if (!result.sent) warnings.push(`${recipient.email}: ${result.reason || "email failed"}`);
  }

  // Sequential / grouped: do NOT email later signers yet — they get the invite only after the previous signer finishes.
  // Parallel: everyone was already activated above.
  const notifyQueued = (envelope.workflowType || "sequential") === "parallel";
  if (notifyQueued) {
    const queued = envelope.recipients.filter(
      (recipient) =>
        !["receives_copy", "view_only"].includes(recipient.recipientType || "signer") &&
        !activatedIds.has(recipient.id) &&
        !["declined", "signed", "approved", "acknowledged", "completed"].includes(recipient.status)
    );
    for (const recipient of queued) {
      const result = await sendSignerQueuedEmail(envelope, recipient);
      await addAuditEvent({
        officeId: envelope.officeId,
        envelopeId: envelope.id,
        recipientId: recipient.id,
        type: result.sent ? "email_sent" : "email_failed",
        message: result.sent
          ? `Queued-signer notice emailed to ${recipient.email}`
          : `Queued-signer email failed: ${result.reason}`,
        ipAddress: null,
        userAgent: options?.userAgent || null,
      });
      if (!result.sent) warnings.push(`${recipient.email}: ${result.reason || "email failed"}`);
    }
  }

  envelope.scheduledSendAt = null;
  envelope.scheduledTimezone = null;
  envelope.updatedAt = new Date().toISOString();

  const waitingCount = envelope.recipients.filter(
    (recipient) =>
      !["receives_copy", "view_only"].includes(recipient.recipientType || "signer") &&
      !activatedIds.has(recipient.id) &&
      !["declined", "signed", "approved", "acknowledged", "completed"].includes(recipient.status)
  ).length;

  return {
    ok: true,
    scheduled: false,
    message: warnings.length
      ? `${options?.fromSchedule ? "Scheduled send completed with warnings: " : "Envelope activated with warnings: "}${warnings.join("; ")}`
      : options?.fromSchedule
        ? `Scheduled envelope sent to ${activated.length} recipient(s).`
        : waitingCount > 0 && (envelope.workflowType || "sequential") !== "parallel"
          ? `Envelope sent. Invitation emailed to step 1 (${activated.length}). Next signer(s) will be emailed after they finish.`
          : `Envelope sent. Invitations emailed to ${activated.length} recipient(s).`,
  };
}
