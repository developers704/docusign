import test from "node:test";
import assert from "node:assert/strict";
import type { EnvelopeRecord } from "@/lib/types";
import {
  activateNextRecipients,
  canRecipientAct,
  completeRecipientAction,
  evaluateEnvelopeCompletion,
  normalizeWorkflow,
} from "@/lib/services/envelopeWorkflowService";

function sampleEnvelope(workflowType: EnvelopeRecord["workflowType"], recipientCount = 6): EnvelopeRecord {
  const now = new Date().toISOString();
  return {
    schemaVersion: 2,
    id: "env-1",
    officeId: "o-1",
    officeName: "Office",
    envelopeNumber: "ENV-1",
    title: "Doc",
    message: "",
    originalFileName: "x.pdf",
    originalPdfPath: "storage/x.pdf",
    workingPdfPath: null,
    signedPdfPath: null,
    status: "draft",
    workflowType,
    declineBehavior: "stop_envelope",
    templateId: null,
    templateVersionId: null,
    createdAt: now,
    updatedAt: now,
    sentAt: null,
    completedAt: null,
    voidedAt: null,
    voidReason: null,
    expiresAt: null,
    createdBy: "user@example.com",
    createdByUserId: "u1",
    recipients: Array.from({ length: recipientCount }).map((_, i) => ({
      id: `r-${i + 1}`,
      envelopeId: "env-1",
      templateRoleId: null,
      name: `Recipient ${i + 1}`,
      email: `r${i + 1}@example.com`,
      phone: null,
      recipientType: "signer",
      order: i + 1,
      signingStep: workflowType === "parallel" ? 1 : i + 1,
      stepGroup: null,
      status: "pending",
      isRequired: true,
      activatedAt: null,
      completedAt: null,
      sentAt: null,
      viewedAt: null,
      signedAt: null,
      approvedAt: null,
      acknowledgedAt: null,
      declinedAt: null,
      declineReason: null,
      authenticationMethod: "none",
      tokenHash: "",
      tokenVersion: 1,
      tokenRevokedAt: null,
      tokenExpiresAt: null,
      otpHash: null,
      otpExpiresAt: null,
      otpVerifiedAt: null,
      otpAttemptCount: 0,
      otpLockedUntil: null,
      otpLastSentAt: null,
      reminderCount: 0,
      metadata: {},
      signatureMethod: null,
      signerIpAddress: null,
      signerUserAgent: null,
    })),
    originalSha256: null,
    signedSha256: null,
    certificateId: null,
    fields: [],
    pageAssignments: [],
    preparedAt: now,
  };
}

test("recipient scalability supports more than five recipients", () => {
  const envelope = sampleEnvelope("sequential", 8);
  normalizeWorkflow(envelope);
  assert.equal(envelope.recipients.length, 8);
  const activated = activateNextRecipients(envelope);
  assert.equal(activated.length, 1);
});

test("parallel workflow activates all recipients", () => {
  const envelope = sampleEnvelope("parallel", 4);
  normalizeWorkflow(envelope);
  const activated = activateNextRecipients(envelope);
  assert.equal(activated.length, 4);
  assert.equal(canRecipientAct(envelope, envelope.recipients[0]), true);
  assert.equal(canRecipientAct(envelope, envelope.recipients[3]), true);
});

test("sequential workflow blocks future recipients", () => {
  const envelope = sampleEnvelope("sequential", 3);
  normalizeWorkflow(envelope);
  activateNextRecipients(envelope);
  assert.equal(canRecipientAct(envelope, envelope.recipients[0]), true);
  assert.equal(canRecipientAct(envelope, envelope.recipients[1]), false);
  completeRecipientAction({ envelope, recipient: envelope.recipients[0], action: "signed" });
  activateNextRecipients(envelope);
  assert.equal(canRecipientAct(envelope, envelope.recipients[1]), true);
});

test("envelope completes after all required recipients", () => {
  const envelope = sampleEnvelope("grouped", 2);
  envelope.recipients[0].signingStep = 1;
  envelope.recipients[1].signingStep = 1;
  normalizeWorkflow(envelope);
  activateNextRecipients(envelope);
  completeRecipientAction({ envelope, recipient: envelope.recipients[0], action: "signed" });
  assert.equal(evaluateEnvelopeCompletion(envelope), false);
  completeRecipientAction({ envelope, recipient: envelope.recipients[1], action: "signed" });
  assert.equal(evaluateEnvelopeCompletion(envelope), true);
  assert.equal(envelope.status, "completed");
});

