import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  addAuditEvent,
  createEnvelopeNumber,
  getOfficeById,
  readEnvelopes,
  readTemplates,
  writeEnvelopes,
  writeTemplates,
} from "@/lib/store";
import type { EnvelopeRecord, PowerFormRecord, RecipientRecord, TemplateRecord } from "@/lib/types";
import {
  activateNextRecipients,
  buildRoleToRecipientMap,
  issueRecipientSigningToken,
  mapTemplateRoleRecipients,
  normalizeWorkflow,
} from "@/lib/services/envelopeWorkflowService";
import { resolveTemplatePdfForEnvelope } from "@/lib/services/templatePdfResolve";
import { templateHasSigningFields } from "@/lib/templateSigningFields";

export type PowerFormEnvelopeLaunchResult = {
  envelope: EnvelopeRecord;
  signingToken: string;
  primaryRecipientId: string;
};

function resolveSignerFromIntake(intake: Record<string, string>) {
  const name = (intake.name || "").trim();
  const email = (intake.email || "").trim().toLowerCase();
  if (!name || !email) throw new Error("Name and email are required to create the envelope.");
  return { name, email, phone: (intake.phone || "").trim() || null };
}

function buildRecipients(input: {
  envelopeId: string;
  form: PowerFormRecord;
  template: TemplateRecord;
  intake: Record<string, string>;
  nowIso: string;
}): RecipientRecord[] {
  const roles = input.template.recipientRoles || [];
  const primaryRole = roles[0];
  const signer = resolveSignerFromIntake(input.intake);
  const recipients: RecipientRecord[] = [];

  const primaryId = crypto.randomUUID();
  recipients.push({
    id: primaryId,
    envelopeId: input.envelopeId,
    templateRoleId: primaryRole?.id || null,
    name: signer.name,
    email: signer.email,
    phone: signer.phone,
    recipientType: primaryRole?.roleType || "signer",
    order: 1,
    signingStep: 1,
    stepGroup: null,
    status: "sent",
    isRequired: true,
    activatedAt: input.nowIso,
    completedAt: null,
    sentAt: input.nowIso,
    viewedAt: null,
    signedAt: null,
    approvedAt: null,
    acknowledgedAt: null,
    declinedAt: null,
    declineReason: null,
    authenticationMethod: "none",
    tokenHash: "",
    tokenVersion: 0,
    tokenRevokedAt: null,
    tokenExpiresAt: null,
    otpHash: null,
    otpExpiresAt: null,
    otpVerifiedAt: null,
    otpAttemptCount: 0,
    otpLockedUntil: null,
    otpLastSentAt: null,
    reminderCount: 0,
    metadata: { source: "powerform", powerFormId: input.form.id },
    signatureMethod: null,
    signerIpAddress: null,
    signerUserAgent: null,
    signerTimezone: null,
  });

  if (input.form.recipientMode === "self_signer_plus_internal" || input.form.recipientMode === "fixed_recipients") {
    const mappings = input.form.defaultRecipientMappings || [];
    let order = 2;
    for (const mapping of mappings) {
      const role = roles.find((item) => item.id === mapping.templateRoleId);
      if (!role || role.id === primaryRole?.id) continue;
      let name = "";
      let email = "";
      if (mapping.source === "fixed") {
        name = (mapping.fixedName || "").trim();
        email = (mapping.fixedEmail || "").trim().toLowerCase();
      } else {
        name = (input.intake[mapping.nameFrom || "name"] || "").trim();
        email = (input.intake[mapping.emailFrom || "email"] || "").trim().toLowerCase();
      }
      if (!name || !email) continue;
      recipients.push({
        id: crypto.randomUUID(),
        envelopeId: input.envelopeId,
        templateRoleId: role.id,
        name,
        email,
        phone: null,
        recipientType: role.roleType || "signer",
        order,
        signingStep: order,
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
        tokenVersion: 0,
        tokenRevokedAt: null,
        tokenExpiresAt: null,
        otpHash: null,
        otpExpiresAt: null,
        otpVerifiedAt: null,
        otpAttemptCount: 0,
        otpLockedUntil: null,
        otpLastSentAt: null,
        reminderCount: 0,
        metadata: { source: "powerform", powerFormId: input.form.id },
        signatureMethod: null,
        signerIpAddress: null,
        signerUserAgent: null,
        signerTimezone: null,
      });
      order += 1;
    }
  }

  return recipients;
}

function fieldValueFromIntake(
  fieldType: string,
  intake: Record<string, string>,
  defaults: Record<string, string>,
  signer: { name: string; email: string }
) {
  if (fieldType === "name" || fieldType === "signer_name") return signer.name;
  if (fieldType === "email" || fieldType === "signer_email") return signer.email;
  if (fieldType === "phone") return intake.phone || defaults.phone || "";
  if (intake[fieldType]) return intake[fieldType];
  return defaults[fieldType] || "";
}

/**
 * Always creates a brand-new envelope for a PowerForm submission.
 * Never reuses an existing envelope across submitters.
 */
export async function createEnvelopeForPowerFormSubmission(input: {
  form: PowerFormRecord;
  intake: Record<string, string>;
  request: Request;
  submissionId: string;
}): Promise<PowerFormEnvelopeLaunchResult> {
  const templates = await readTemplates();
  const template = templates.find((item) => item.id === input.form.templateId);
  if (!template) throw new Error("Template for this form is unavailable.");
  if (!templateHasSigningFields(template)) {
    throw new Error("This form’s template has no Signature/Initial fields.");
  }

  const office = await getOfficeById(input.form.officeId);
  if (!office || !office.isActive) throw new Error("Office for this form is unavailable.");

  const signer = resolveSignerFromIntake(input.intake);
  const nowIso = new Date().toISOString();
  const envelopeId = crypto.randomUUID();
  const title = input.form.name || template.title || template.name;

  const resolved = await resolveTemplatePdfForEnvelope({
    template,
    officeName: office.name,
    title,
    recipients: [signer],
  });
  const pdfBytes = Buffer.from(resolved.bytes);
  const originalDirectory = path.join(process.cwd(), "storage", "offices", office.id, "original");
  await mkdir(originalDirectory, { recursive: true });
  const fileName = `${envelopeId}.pdf`;
  await writeFile(path.join(originalDirectory, fileName), pdfBytes);

  const recipients = buildRecipients({
    envelopeId,
    form: input.form,
    template,
    intake: input.intake,
    nowIso,
  });
  const primary = recipients[0];

  const envelope: EnvelopeRecord = {
    schemaVersion: 2,
    id: envelopeId,
    officeId: office.id,
    officeName: office.name,
    envelopeNumber: createEnvelopeNumber(office.slug),
    title,
    message: template.message || "",
    originalFileName: resolved.originalFileName,
    originalPdfPath: `storage/offices/${office.id}/original/${fileName}`,
    workingPdfPath: null,
    signedPdfPath: null,
    workflowType: input.form.workflowType || "sequential",
    declineBehavior: "stop_envelope",
    templateId: template.id,
    templateVersionId: input.form.templateVersionId || template.currentVersionId || null,
    status: "sent",
    createdAt: nowIso,
    updatedAt: nowIso,
    sentAt: nowIso,
    completedAt: null,
    voidedAt: null,
    voidReason: null,
    expiresAt: null,
    createdBy: input.form.createdByEmail || "powerform",
    createdByUserId: input.form.createdByUserId || "",
    recipients,
    originalSha256: crypto.createHash("sha256").update(pdfBytes).digest("hex"),
    signedSha256: null,
    certificateId: null,
    fields: (template.fields || []).map((field) => {
      const roleRecipient =
        recipients.find((r) => r.templateRoleId && r.templateRoleId === field.recipientRoleId) || primary;
      return {
        id: crypto.randomUUID(),
        type: field.type,
        recipientId: roleRecipient.id,
        templateRoleId: field.recipientRoleId,
        page: field.page,
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height,
        required: field.required,
        label: field.label,
        tooltip: field.tooltip || field.helpText || field.label,
        value: fieldValueFromIntake(field.type, input.intake, input.form.defaultFieldValues || {}, signer) || field.defaultValue || "",
        options: Array.isArray((field as { options?: string[] }).options)
          ? (field as { options?: string[] }).options
          : undefined,
      };
    }),
    pageAssignments: (template.pageAssignments || []).map((assignment) => ({
      id: crypto.randomUUID(),
      pageNumber: assignment.pageNumber,
      pageLabel: assignment.pageLabel,
      assignedRecipientIds: recipients
        .filter((r) => r.templateRoleId && assignment.assignedRoleIds.includes(r.templateRoleId))
        .map((r) => r.id),
      assignedTemplateRoleIds: assignment.assignedRoleIds,
      responsibilityType: assignment.responsibilityType,
      visibility: assignment.visibility,
      isRequired: assignment.isRequired,
      signingStep: assignment.signingStep,
      allowComments: assignment.allowComments,
      allowAttachments: assignment.allowAttachments,
      readOnly: assignment.readOnly,
    })),
  };

  normalizeWorkflow(envelope);
  mapTemplateRoleRecipients(envelope, buildRoleToRecipientMap(envelope));
  activateNextRecipients(envelope);
  const signingToken = issueRecipientSigningToken(primary);
  primary.status = "active";
  primary.sentAt = nowIso;
  primary.activatedAt = nowIso;
  envelope.status = "sent";
  envelope.sentAt = nowIso;

  const envelopes = await readEnvelopes();
  envelopes.push(envelope);
  await writeEnvelopes(envelopes);

  template.usageCount = (template.usageCount || 0) + 1;
  template.updatedAt = nowIso;
  await writeTemplates(templates.map((item) => (item.id === template.id ? template : item)));

  await addAuditEvent({
    officeId: office.id,
    envelopeId,
    recipientId: primary.id,
    type: "envelope_created",
    message: `${signer.name} started signing via PowerForm`,
    ipAddress: null,
    userAgent: input.request.headers.get("user-agent"),
    metadata: {
      formId: input.form.id,
      formKind: "powerform",
      templateId: template.id,
      submissionId: input.submissionId,
    },
  });

  return { envelope, signingToken, primaryRecipientId: primary.id };
}
