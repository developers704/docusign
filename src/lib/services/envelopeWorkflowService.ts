import crypto from "node:crypto";
import type { EnvelopeRecord, RecipientRecord, WorkflowType } from "@/lib/types";
import {
  addAuditEvent,
  createSigningTokenPayload,
  getCurrentRecipient,
  hashToken,
  isRecipientCompleted,
} from "@/lib/store";

function nowIso() {
  return new Date().toISOString();
}

function isActionableRecipient(recipient: RecipientRecord) {
  return !["receives_copy", "view_only"].includes(recipient.recipientType || "signer");
}

function markRecipientActive(recipient: RecipientRecord, now: string) {
  if (!["pending", "sent"].includes(recipient.status)) return false;
  recipient.status = "active";
  recipient.activatedAt ||= now;
  return true;
}

export function issueRecipientSigningToken(recipient: RecipientRecord) {
  const tokenVersion = (recipient.tokenVersion || 0) + 1;
  const rawToken = createSigningTokenPayload({ recipientId: recipient.id, tokenVersion });
  recipient.tokenVersion = tokenVersion;
  recipient.tokenHash = hashToken(rawToken);
  recipient.tokenRevokedAt = null;
  recipient.signingToken = undefined;
  return rawToken;
}

export function revokeRecipientToken(recipient: RecipientRecord) {
  recipient.tokenRevokedAt = nowIso();
}

export function normalizeWorkflow(envelope: EnvelopeRecord) {
  envelope.workflowType = envelope.workflowType || "sequential";
  envelope.declineBehavior = envelope.declineBehavior || "stop_envelope";
  for (let i = 0; i < envelope.recipients.length; i += 1) {
    const recipient = envelope.recipients[i];
    recipient.order = recipient.order || i + 1;
    recipient.signingStep = recipient.signingStep || recipient.order;
    recipient.recipientType = recipient.recipientType || "signer";
    recipient.isRequired = recipient.isRequired !== false;
  }
  if (envelope.workflowType === "parallel") {
    for (const recipient of envelope.recipients) {
      if (isActionableRecipient(recipient)) recipient.signingStep = 1;
    }
  }
  if (envelope.workflowType === "grouped") {
    // Keep user-assigned step values; fill missing from order.
    for (const recipient of envelope.recipients) recipient.signingStep ||= recipient.order;
  }
}

export function getActiveRecipients(envelope: EnvelopeRecord) {
  const actionable = envelope.recipients.filter(isActionableRecipient);
  if (envelope.workflowType === "parallel") {
    return actionable.filter((recipient) => !isRecipientCompleted(recipient) && recipient.status !== "declined");
  }
  const remainingSteps = actionable
    .filter((recipient) => !isRecipientCompleted(recipient) && recipient.status !== "declined")
    .map((recipient) => recipient.signingStep || recipient.order);
  const step = Math.min(...remainingSteps);
  if (!Number.isFinite(step)) return [];
  return actionable.filter((recipient) => (recipient.signingStep || recipient.order) === step);
}

export function canRecipientAct(envelope: EnvelopeRecord, recipient: RecipientRecord) {
  if (recipient.tokenRevokedAt) return false;
  if (!isActionableRecipient(recipient)) return false;
  if (["completed", "voided", "declined", "expired"].includes(envelope.status)) return false;
  const current = getCurrentRecipient(envelope);
  if (!current) return false;
  if (envelope.workflowType === "parallel") {
    return !isRecipientCompleted(recipient) && recipient.status !== "declined";
  }
  return (recipient.signingStep || recipient.order) === (current.signingStep || current.order);
}

export function activateNextRecipients(envelope: EnvelopeRecord) {
  const now = nowIso();
  const activeRecipients = getActiveRecipients(envelope);
  const activated: RecipientRecord[] = [];
  for (const recipient of activeRecipients) {
    if (markRecipientActive(recipient, now)) activated.push(recipient);
  }
  if (activated.length) {
    envelope.status = "sent";
    envelope.sentAt ||= now;
    envelope.updatedAt = now;
  }
  return activated;
}

export function completeRecipientAction(input: {
  envelope: EnvelopeRecord;
  recipient: RecipientRecord;
  action: "signed" | "approved" | "acknowledged";
}) {
  const now = nowIso();
  const { recipient, action } = input;
  recipient.status = action;
  recipient.completedAt = now;
  if (action === "signed") recipient.signedAt = now;
  if (action === "approved") recipient.approvedAt = now;
  if (action === "acknowledged") recipient.acknowledgedAt = now;
  revokeRecipientToken(recipient);
  input.envelope.updatedAt = now;
}

export function evaluateEnvelopeCompletion(envelope: EnvelopeRecord) {
  const blockers = envelope.recipients.filter(
    (recipient) =>
      isActionableRecipient(recipient) &&
      recipient.isRequired !== false &&
      !isRecipientCompleted(recipient) &&
      recipient.status !== "declined"
  );
  if (blockers.length === 0) {
    envelope.status = "completed";
    envelope.completedAt = nowIso();
    envelope.updatedAt = envelope.completedAt;
    return true;
  }
  return false;
}

export async function auditStepActivation(envelope: EnvelopeRecord, recipients: RecipientRecord[]) {
  if (!recipients.length) return;
  const step = recipients[0].signingStep || recipients[0].order;
  await addAuditEvent({
    officeId: envelope.officeId,
    envelopeId: envelope.id,
    recipientId: null,
    type: "signing_step_activated",
    message: `Signing step ${step} activated for ${recipients.length} recipient(s).`,
    ipAddress: null,
    userAgent: null,
    metadata: { workflowType: envelope.workflowType || "sequential", step, recipients: recipients.length },
  });
}

export function inferRecipientActionType(recipient: RecipientRecord): "signed" | "approved" | "acknowledged" {
  if (recipient.recipientType === "approver") return "approved";
  if (recipient.recipientType === "reviewer" || recipient.recipientType === "view_only") return "acknowledged";
  return "signed";
}

export function mapTemplateRoleRecipients(
  envelope: EnvelopeRecord,
  roleToRecipients: Record<string, string[]>
) {
  for (const field of envelope.fields || []) {
    if (!field.templateRoleId || field.recipientId) continue;
    const recipients = roleToRecipients[field.templateRoleId] || [];
    if (recipients.length === 1) field.recipientId = recipients[0];
  }
  for (const assignment of envelope.pageAssignments || []) {
    const recipientIds = new Set<string>(assignment.assignedRecipientIds || []);
    for (const roleId of assignment.assignedTemplateRoleIds || []) {
      for (const recipientId of roleToRecipients[roleId] || []) recipientIds.add(recipientId);
    }
    assignment.assignedRecipientIds = [...recipientIds];
  }
}

export function detectWorkflowIssues(envelope: EnvelopeRecord) {
  const issues: string[] = [];
  const recipients = envelope.recipients;
  if (!recipients.some((recipient) => isActionableRecipient(recipient))) {
    issues.push("At least one actionable recipient is required.");
  }
  if (!["sequential", "parallel", "grouped"].includes(envelope.workflowType || "")) {
    issues.push("Invalid workflow type.");
  }
  for (const recipient of recipients) {
    if (!recipient.email || !/^\S+@\S+\.\S+$/.test(recipient.email)) {
      issues.push(`Invalid recipient email for ${recipient.name || recipient.id}.`);
    }
    if ((recipient.signingStep || 0) < 1) {
      issues.push(`Recipient ${recipient.name || recipient.id} has an invalid signing step.`);
    }
  }
  return issues;
}

export function setWorkflowType(envelope: EnvelopeRecord, workflowType: WorkflowType) {
  envelope.workflowType = workflowType;
  normalizeWorkflow(envelope);
}

export function buildRoleToRecipientMap(envelope: EnvelopeRecord) {
  const map: Record<string, string[]> = {};
  for (const recipient of envelope.recipients) {
    if (!recipient.templateRoleId) continue;
    if (!map[recipient.templateRoleId]) map[recipient.templateRoleId] = [];
    map[recipient.templateRoleId].push(recipient.id);
  }
  return map;
}

export function legacyNormalizeAuditMetadata(envelope: EnvelopeRecord) {
  return {
    workflowType: envelope.workflowType || "sequential",
    recipients: envelope.recipients.length,
    normalizedAt: nowIso(),
  };
}

export function createRecipientId() {
  return crypto.randomUUID();
}

