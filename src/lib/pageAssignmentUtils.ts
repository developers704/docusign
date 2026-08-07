import type { EnvelopeRecord, RecipientRecord } from "@/lib/types";

function newId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export type EnvelopePageAssignment = NonNullable<EnvelopeRecord["pageAssignments"]>[number];

function actionableRecipients(recipients: RecipientRecord[]) {
  return [...recipients]
    .filter((recipient) => !["receives_copy", "view_only"].includes(recipient.recipientType || "signer"))
    .sort((a, b) => (a.signingStep || a.order || 0) - (b.signingStep || b.order || 0));
}

export function createPageAssignment(input: {
  pageNumber: number;
  recipientId: string;
  signingStep?: number | null;
  pageLabel?: string;
}): EnvelopePageAssignment {
  return {
    id: newId(),
    pageNumber: input.pageNumber,
    pageLabel: input.pageLabel || `Section ${input.pageNumber}`,
    assignedRecipientIds: [input.recipientId],
    assignedTemplateRoleIds: [],
    responsibilityType: "must_sign",
    visibility: "assigned_recipients_only",
    isRequired: true,
    signingStep: input.signingStep ?? input.pageNumber,
    allowComments: false,
    allowAttachments: false,
    readOnly: false,
  };
}

export function buildSequentialSectionAssignments(pageCount: number, recipients: RecipientRecord[]) {
  const ordered = actionableRecipients(recipients);
  const assignments: EnvelopePageAssignment[] = [];
  for (let page = 1; page <= pageCount; page += 1) {
    const recipient = ordered[page - 1];
    if (!recipient) break;
    assignments.push(
      createPageAssignment({
        pageNumber: page,
        recipientId: recipient.id,
        signingStep: recipient.signingStep || page,
        pageLabel: `Section ${page}`,
      })
    );
  }
  return assignments;
}

export function buildAllPagesSharedAssignment(pageCount: number, recipients: RecipientRecord[]) {
  const recipientIds = recipients.map((recipient) => recipient.id);
  return Array.from({ length: pageCount }, (_, index) => ({
    id: newId(),
    pageNumber: index + 1,
    pageLabel: `Page ${index + 1}`,
    assignedRecipientIds: recipientIds,
    assignedTemplateRoleIds: [],
    responsibilityType: "shared" as const,
    visibility: "all_recipients" as const,
    isRequired: false,
    signingStep: null,
    allowComments: false,
    allowAttachments: false,
    readOnly: false,
  }));
}

export function buildDefaultPageAssignments(envelope: EnvelopeRecord, pageCount: number) {
  if (envelope.pageAssignments?.length) return envelope.pageAssignments;
  const actionable = actionableRecipients(envelope.recipients);
  if (
    pageCount > 1 &&
    actionable.length > 1 &&
    (envelope.workflowType === "sequential" || envelope.workflowType === "grouped")
  ) {
    return buildSequentialSectionAssignments(pageCount, envelope.recipients);
  }
  return buildAllPagesSharedAssignment(pageCount, envelope.recipients);
}

export function updatePageAssignmentRecipient(
  assignments: EnvelopePageAssignment[],
  pageNumber: number,
  recipientId: string,
  recipients: RecipientRecord[]
) {
  const recipient = recipients.find((item) => item.id === recipientId);
  return assignments.map((assignment) =>
    assignment.pageNumber === pageNumber
      ? {
          ...assignment,
          assignedRecipientIds: recipientId ? [recipientId] : [],
          assignedTemplateRoleIds: [],
          visibility: recipientId ? ("assigned_recipients_only" as const) : ("all_recipients" as const),
          responsibilityType: recipientId ? ("must_sign" as const) : ("shared" as const),
          signingStep: recipient?.signingStep || assignment.signingStep,
          pageLabel: assignment.pageLabel || `Section ${pageNumber}`,
        }
      : assignment
  );
}

export function recipientForPage(assignments: EnvelopePageAssignment[], pageNumber: number) {
  const assignment = assignments.find((item) => item.pageNumber === pageNumber);
  return assignment?.assignedRecipientIds?.[0] || "";
}

export function usesSectionSigning(assignments: EnvelopePageAssignment[]) {
  return assignments.some(
    (assignment) =>
      assignment.visibility === "assigned_recipients_only" && assignment.assignedRecipientIds.length === 1
  );
}

export function buildSectionSignatureFields(input: {
  pageAssignments: EnvelopePageAssignment[];
  existingFields: Array<{ page: number; recipientId: string; type: string }>;
}) {
  const created: Array<{
    id: string;
    type: "signature";
    recipientId: string;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    required: boolean;
    label: string;
    tooltip: string;
  }> = [];

  for (const assignment of input.pageAssignments) {
    const recipientId = assignment.assignedRecipientIds[0];
    if (!recipientId || assignment.visibility !== "assigned_recipients_only") continue;
    const alreadyHasSignature = input.existingFields.some(
      (field) =>
        field.page === assignment.pageNumber &&
        field.recipientId === recipientId &&
        field.type === "signature"
    );
    if (alreadyHasSignature) continue;
    created.push({
      id: newId(),
      type: "signature",
      recipientId,
      page: assignment.pageNumber,
      x: 35,
      y: 78,
      width: 26,
      height: 3.2,
      required: true,
      label: "Signature",
      tooltip: "Sign here",
    });
  }
  return created;
}

export function sectionFieldStatus(
  pageCount: number,
  recipients: RecipientRecord[],
  pageAssignments: EnvelopePageAssignment[],
  fields: Array<{ page: number; recipientId: string; type: string }>
) {
  const ordered = actionableRecipients(recipients);
  return Array.from({ length: pageCount }, (_, index) => {
    const pageNumber = index + 1;
    const assignedId = recipientForPage(pageAssignments, pageNumber);
    const recipient = ordered.find((item) => item.id === assignedId) || recipients.find((item) => item.id === assignedId);
    const hasSignature = assignedId
      ? fields.some((field) => field.page === pageNumber && field.recipientId === assignedId && field.type === "signature")
      : fields.some((field) => field.page === pageNumber && field.type === "signature");
    return {
      pageNumber,
      recipientId: assignedId,
      recipientName: recipient?.name || "Unassigned",
      hasSignature,
    };
  });
}
