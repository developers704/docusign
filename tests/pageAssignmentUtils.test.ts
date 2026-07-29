import test from "node:test";
import assert from "node:assert/strict";
import type { EnvelopeRecord, RecipientRecord } from "@/lib/types";
import {
  buildDefaultPageAssignments,
  buildSectionSignatureFields,
  buildSequentialSectionAssignments,
  recipientForPage,
  usesSectionSigning,
} from "@/lib/pageAssignmentUtils";

function recipient(id: string, step: number): RecipientRecord {
  return {
    id,
    envelopeId: "e1",
    templateRoleId: null,
    name: `User ${step}`,
    email: `user${step}@example.com`,
    phone: null,
    recipientType: "signer",
    order: step,
    signingStep: step,
    stepGroup: null,
    status: "pending",
    isRequired: true,
    activatedAt: null,
    completedAt: null,
    sentAt: null,
    viewedAt: null,
    signedAt: null,
    declinedAt: null,
    declineReason: null,
    tokenHash: "",
    otpHash: null,
    otpExpiresAt: null,
    otpVerifiedAt: null,
    signatureMethod: null,
    signerIpAddress: null,
    signerUserAgent: null,
  };
}

function envelope(workflowType: EnvelopeRecord["workflowType"], recipients: RecipientRecord[]): EnvelopeRecord {
  return {
    id: "e1",
    officeId: "o1",
    officeName: "Office",
    envelopeNumber: "ENV-1",
    title: "Agreement",
    message: "",
    originalFileName: "agreement.pdf",
    status: "draft",
    workflowType,
    templateId: null,
    originalPdfPath: "storage/x.pdf",
    workingPdfPath: null,
    signedPdfPath: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sentAt: null,
    completedAt: null,
    voidedAt: null,
    voidReason: null,
    expiresAt: null,
    createdBy: "admin@example.com",
    createdByUserId: "u1",
    recipients,
    originalSha256: null,
    signedSha256: null,
    certificateId: null,
    fields: [],
    pageAssignments: [],
  };
}

test("buildSequentialSectionAssignments maps pages to signers in order", () => {
  const assignments = buildSequentialSectionAssignments(3, [
    recipient("r1", 1),
    recipient("r2", 2),
    recipient("r3", 3),
  ]);
  assert.equal(assignments.length, 3);
  assert.equal(recipientForPage(assignments, 1), "r1");
  assert.equal(recipientForPage(assignments, 2), "r2");
  assert.equal(recipientForPage(assignments, 3), "r3");
  assert.equal(usesSectionSigning(assignments), true);
});

test("buildDefaultPageAssignments auto-creates sequential sections", () => {
  const assignments = buildDefaultPageAssignments(
    envelope("sequential", [recipient("r1", 1), recipient("r2", 2), recipient("r3", 3)]),
    3
  );
  assert.equal(assignments.length, 3);
  assert.equal(recipientForPage(assignments, 2), "r2");
});

test("buildSectionSignatureFields adds one signature per assigned page", () => {
  const assignments = buildSequentialSectionAssignments(3, [
    recipient("r1", 1),
    recipient("r2", 2),
    recipient("r3", 3),
  ]);
  const fields = buildSectionSignatureFields({ pageAssignments: assignments, existingFields: [] });
  assert.equal(fields.length, 3);
  assert.equal(fields[0].page, 1);
  assert.equal(fields[0].recipientId, "r1");
  assert.equal(fields[2].recipientId, "r3");
});
