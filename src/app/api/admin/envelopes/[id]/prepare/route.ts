import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { canAccessOffice, canCreateEnvelopes, requireAdminApi } from "@/lib/auth";
import { addAuditEvent, readEnvelopes, writeEnvelopes } from "@/lib/store";
import { roleForSigningStep } from "@/lib/recipientFormUtils";
import type { DocumentField, EnvelopeRecord } from "@/lib/types";

const allowed = new Set([
  "signature",
  "initials",
  "name",
  "email",
  "date",
  "text",
  "checkbox",
  "signer_company",
  "signer_title",
  "phone",
  "address",
  "number",
  "dropdown",
  "radio_group",
  "approve",
  "decline",
  "instruction_text",
  "attachment_request",
]);

type PageAssignmentInput = NonNullable<EnvelopeRecord["pageAssignments"]>[number];

function sanitizePageAssignments(
  raw: unknown,
  recipientIds: Set<string>,
  pageCount: number
): PageAssignmentInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item) =>
        item &&
        typeof item === "object" &&
        Number.isInteger((item as PageAssignmentInput).pageNumber) &&
        (item as PageAssignmentInput).pageNumber >= 1 &&
        (item as PageAssignmentInput).pageNumber <= pageCount
    )
    .map((item) => {
      const assignment = item as PageAssignmentInput;
      const assignedRecipientIds = Array.isArray(assignment.assignedRecipientIds)
        ? assignment.assignedRecipientIds.filter((id) => recipientIds.has(String(id)))
        : [];
      return {
        id: typeof assignment.id === "string" ? assignment.id : crypto.randomUUID(),
        pageNumber: assignment.pageNumber,
        pageLabel: String(assignment.pageLabel || `Section ${assignment.pageNumber}`).slice(0, 80),
        assignedRecipientIds,
        assignedTemplateRoleIds: [],
        responsibilityType: assignment.responsibilityType || "must_sign",
        visibility:
          assignedRecipientIds.length === 1
            ? "assigned_recipients_only"
            : assignment.visibility || "all_recipients",
        isRequired: assignment.isRequired !== false,
        signingStep: assignment.signingStep ?? null,
        allowComments: Boolean(assignment.allowComments),
        allowAttachments: Boolean(assignment.allowAttachments),
        readOnly: Boolean(assignment.readOnly),
      };
    });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!canCreateEnvelopes(session)) return NextResponse.json({ error: "Your role cannot prepare envelopes." }, { status: 403 });
  const { id } = await params;
  const envelopes = await readEnvelopes();
  const envelope = envelopes.find((item) => item.id === id);
  if (!envelope || !canAccessOffice(session, envelope.officeId)) return NextResponse.json({ error: "Envelope not found." }, { status: 404 });
  if (envelope.status !== "draft") return NextResponse.json({ error: "Only draft envelopes can be prepared." }, { status: 409 });
  const body = (await request.json()) as {
    fields?: DocumentField[];
    pageAssignments?: unknown;
    pageCount?: number;
    workflowType?: "sequential" | "parallel" | "grouped";
    recipients?: Array<{ id: string; order?: number; signingStep?: number; roleLabel?: string }>;
    draftOnly?: boolean;
  };
  const recipientIds = new Set(envelope.recipients.map((r) => r.id));
  const pageCount = Math.max(1, Number(body.pageCount) || 1);
  const fields = (Array.isArray(body.fields) ? body.fields : []).filter((f) =>
    f && typeof f.id === "string" && allowed.has(f.type) && recipientIds.has(f.recipientId) &&
    Number.isInteger(f.page) && f.page >= 1 && Number.isFinite(f.x) && Number.isFinite(f.y) &&
    Number.isFinite(f.width) && Number.isFinite(f.height)
  ).map((f) => ({
    ...f,
    x: Math.max(0, Math.min(95, f.x)), y: Math.max(0, Math.min(95, f.y)),
    width: Math.max(4, Math.min(70, f.width)), height: Math.max(2, Math.min(25, f.height)),
    required: Boolean(f.required),
    label: String(f.label || f.type).slice(0, 80),
    tooltip: String(f.tooltip || "").slice(0, 160),
    value: typeof f.value === "string" ? f.value.slice(0, 200) : undefined,
    options: Array.isArray(f.options)
      ? f.options.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 12)
      : undefined,
  }));
  const draftOnly = body.draftOnly === true;
  if (!draftOnly && !fields.some((f) => f.type === "signature")) {
    return NextResponse.json({ error: "Add at least one signature field." }, { status: 400 });
  }
  const actionable = envelope.recipients.filter(
    (recipient) => !["receives_copy", "view_only"].includes(recipient.recipientType || "signer")
  );
  const missing = actionable.filter(
    (recipient) => !fields.some((f) => f.recipientId === recipient.id && f.type === "signature")
  );
  if (!draftOnly && missing.length) {
    return NextResponse.json(
      {
        error: `Add a Signature field for each signer: ${missing.map((item) => item.name).join(", ")}.`,
        missingSignerIds: missing.map((item) => item.id),
      },
      { status: 400 }
    );
  }
  envelope.fields = fields;
  envelope.pageAssignments = sanitizePageAssignments(body.pageAssignments, recipientIds, pageCount);
  if (body.workflowType === "sequential" || body.workflowType === "parallel" || body.workflowType === "grouped") {
    envelope.workflowType = body.workflowType;
  }
  if (Array.isArray(body.recipients) && body.recipients.length) {
    const patchById = new Map(
      body.recipients
        .filter((item) => item && typeof item.id === "string" && recipientIds.has(item.id))
        .map((item) => [item.id, item])
    );
    envelope.recipients = envelope.recipients.map((recipient) => {
      const patch = patchById.get(recipient.id);
      if (!patch) return recipient;
      const order = Math.max(1, Number(patch.order) || recipient.order);
      const signingStep = Math.max(1, Number(patch.signingStep) || order);
      const roleLabel = patch.roleLabel?.trim() || roleForSigningStep(signingStep);
      return {
        ...recipient,
        order,
        signingStep,
        metadata: { ...(recipient.metadata || {}), roleLabel },
      };
    });
    envelope.recipients.sort((a, b) => (a.signingStep || a.order) - (b.signingStep || b.order));
  }
  envelope.preparedAt = new Date().toISOString();
  envelope.updatedAt = envelope.preparedAt;

  // Bulk send: copy the same field layout onto sibling drafts (each has one signer).
  let syncedBulkCount = 0;
  if (envelope.bulkBatchId) {
    const siblings = envelopes.filter(
      (item) =>
        item.id !== envelope.id &&
        item.bulkBatchId === envelope.bulkBatchId &&
        item.status === "draft" &&
        item.recipients.length === 1
    );
    for (const sibling of siblings) {
      const soleId = sibling.recipients[0].id;
      sibling.fields = fields.map((field) => ({
        ...field,
        id: crypto.randomUUID(),
        recipientId: soleId,
      }));
      sibling.pageAssignments = (envelope.pageAssignments || []).map((assignment) => ({
        ...assignment,
        id: crypto.randomUUID(),
        assignedRecipientIds: [soleId],
        assignedTemplateRoleIds: [],
      }));
      sibling.preparedAt = envelope.preparedAt;
      sibling.updatedAt = envelope.preparedAt;
      syncedBulkCount += 1;
    }
  }

  await writeEnvelopes(envelopes);
  await addAuditEvent({
    officeId: envelope.officeId,
    envelopeId: envelope.id,
    recipientId: null,
    type: "envelope_created",
    message: `${session.name} prepared ${fields.length} signing fields`,
    ipAddress: null,
    userAgent: request.headers.get("user-agent"),
    metadata: { fields: fields.length, syncedBulkCount },
  });
  return NextResponse.json({ success: true, syncedBulkCount });
}
