import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  addAuditEvent,
  createEnvelopeNumber,
  getOfficeById,
  readEnvelopes,
  readPowerForms,
  readTemplates,
  readWebForms,
  writeEnvelopes,
  writePowerForms,
  writeTemplates,
  writeWebForms,
} from "@/lib/store";
import type { EnvelopeRecord, PowerFormRecord, TemplateRecord, WebFormRecord } from "@/lib/types";
import {
  activateNextRecipients,
  buildRoleToRecipientMap,
  issueRecipientSigningToken,
  mapTemplateRoleRecipients,
  normalizeWorkflow,
} from "@/lib/services/envelopeWorkflowService";
import { resolveTemplatePdfForEnvelope } from "@/lib/services/templatePdfResolve";
import {
  assertTemplateReadyForPublishedForm,
  templateHasSigningFields,
} from "@/lib/templateSigningFields";

export { assertTemplateReadyForPublishedForm, templateHasSigningFields };

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "form";
}

async function uniqueSlug(base: string, existing: string[]) {
  let slug = slugify(base);
  let attempt = 1;
  while (existing.includes(slug)) {
    attempt += 1;
    slug = `${slugify(base)}-${attempt}`;
  }
  return slug;
}

async function resolveTemplatePdf(template: TemplateRecord, officeName: string, title: string, signer: { name: string; email: string }) {
  const resolved = await resolveTemplatePdfForEnvelope({
    template,
    officeName,
    title,
    recipients: [signer],
  });
  return {
    bytes: Buffer.from(resolved.bytes),
    originalFileName: resolved.originalFileName,
  };
}

export async function createPowerFormFromTemplate(input: {
  template: TemplateRecord;
  name: string;
  actor: { userId: string; email: string };
}) {
  const { createPowerForm } = await import("@/lib/services/powerFormService");
  return createPowerForm({
    template: input.template,
    name: input.name,
    actor: input.actor,
    publish: true,
  });
}

export async function createWebFormFromTemplate(input: {
  template: TemplateRecord;
  name: string;
  instructions?: string;
  actor: { userId: string; email: string };
}) {
  assertTemplateReadyForPublishedForm(input.template);
  const forms = await readWebForms();
  const slug = await uniqueSlug(input.name || input.template.name, forms.map((item) => item.slug));
  const now = new Date().toISOString();
  const form: WebFormRecord = {
    id: crypto.randomUUID(),
    officeId: input.template.officeId,
    templateId: input.template.id,
    name: (input.name || input.template.name).trim(),
    slug,
    status: "active",
    instructions: (input.instructions || "").trim(),
    createdByUserId: input.actor.userId,
    createdByEmail: input.actor.email,
    usageCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  forms.push(form);
  await writeWebForms(forms);
  return form;
}

export async function launchEnvelopeFromPublishedForm(input: {
  kind: "powerform" | "webform";
  form: PowerFormRecord | WebFormRecord;
  signerName: string;
  signerEmail: string;
  message?: string;
  request: Request;
}) {
  if (input.kind === "powerform") {
    const { startPowerFormSubmission } = await import("@/lib/services/powerFormSubmissionService");
    const result = await startPowerFormSubmission({
      slug: input.form.slug,
      intake: { name: input.signerName, email: input.signerEmail },
      consentAccepted: true,
      request: input.request,
    });
    if (result.requiresVerification) {
      throw new Error(result.message || "Email verification required.");
    }
    const envelopes = await readEnvelopes();
    const envelope = envelopes.find((item) => item.id === result.envelopeId);
    if (!envelope) throw new Error("Envelope was not created.");
    const token = result.signUrl.replace(/^\/sign\//, "");
    return { envelope, signingToken: decodeURIComponent(token) };
  }

  const templates = await readTemplates();
  const template = templates.find((item) => item.id === input.form.templateId);
  if (!template) throw new Error("Template for this form is unavailable.");
  const office = await getOfficeById(input.form.officeId);
  if (!office || !office.isActive) throw new Error("Office for this form is unavailable.");

  const signerName = input.signerName.trim();
  const signerEmail = input.signerEmail.trim().toLowerCase();
  if (!signerName || !/^\S+@\S+\.\S+$/.test(signerEmail)) {
    throw new Error("Enter a valid name and email.");
  }

  const nowIso = new Date().toISOString();
  const envelopeId = crypto.randomUUID();
  const title = input.form.name || template.title || template.name;
  const pdf = await resolveTemplatePdf(template, office.name, title, { name: signerName, email: signerEmail });
  const originalDirectory = path.join(process.cwd(), "storage", "offices", office.id, "original");
  await mkdir(originalDirectory, { recursive: true });
  const fileName = `${envelopeId}.pdf`;
  const destPath = path.join(originalDirectory, fileName);
  await writeFile(destPath, pdf.bytes);

  const role = template.recipientRoles?.[0];
  const recipientId = crypto.randomUUID();
  const envelope: EnvelopeRecord = {
    schemaVersion: 2,
    id: envelopeId,
    officeId: office.id,
    officeName: office.name,
    envelopeNumber: createEnvelopeNumber(office.slug),
    title,
    message: input.message?.trim() || template.message || "",
    originalFileName: pdf.originalFileName,
    originalPdfPath: `storage/offices/${office.id}/original/${fileName}`,
    workingPdfPath: null,
    signedPdfPath: null,
    workflowType: "sequential",
    declineBehavior: "stop_envelope",
    templateId: template.id,
    templateVersionId: template.currentVersionId || null,
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
    recipients: [
      {
        id: recipientId,
        envelopeId,
        templateRoleId: role?.id || null,
        name: signerName,
        email: signerEmail,
        phone: null,
        recipientType: role?.roleType || "signer",
        order: 1,
        signingStep: 1,
        stepGroup: null,
        status: "sent",
        isRequired: true,
        activatedAt: nowIso,
        completedAt: null,
        sentAt: nowIso,
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
        metadata: { source: input.kind },
        signatureMethod: null,
        signerIpAddress: null,
        signerUserAgent: null,
        signerTimezone: null,
      },
    ],
    originalSha256: crypto.createHash("sha256").update(pdf.bytes).digest("hex"),
    signedSha256: null,
    certificateId: null,
    fields: (template.fields || []).map((field) => ({
      id: crypto.randomUUID(),
      type: field.type,
      recipientId,
      templateRoleId: field.recipientRoleId,
      page: field.page,
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
      required: field.required,
      label: field.label,
      tooltip: field.tooltip || field.helpText || field.label,
      value:
        field.type === "name" || field.type === "signer_name"
          ? signerName
          : field.type === "email" || field.type === "signer_email"
            ? signerEmail
            : field.defaultValue || "",
      options: Array.isArray((field as { options?: string[] }).options)
        ? (field as { options?: string[] }).options
        : undefined,
    })),
    pageAssignments: (template.pageAssignments || []).map((assignment) => ({
      id: crypto.randomUUID(),
      pageNumber: assignment.pageNumber,
      pageLabel: assignment.pageLabel,
      assignedRecipientIds: [recipientId],
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
  const signingToken = issueRecipientSigningToken(envelope.recipients[0]);
  // Keep signer ready to act immediately (DocuSign PowerForm behavior).
  envelope.recipients[0].status = "active";
  envelope.recipients[0].sentAt = nowIso;
  envelope.recipients[0].activatedAt = nowIso;
  envelope.status = "sent";
  envelope.sentAt = nowIso;

  if (!templateHasSigningFields({ fields: envelope.fields || [] })) {
    throw new Error("This form’s template has no Signature/Initial fields. Add them on the template, then try again.");
  }

  const envelopes = await readEnvelopes();
  envelopes.push(envelope);
  await writeEnvelopes(envelopes);

  template.usageCount = (template.usageCount || 0) + 1;
  template.updatedAt = nowIso;
  await writeTemplates(templates.map((item) => (item.id === template.id ? template : item)));

  if (input.kind === "webform") {
    const forms = await readWebForms();
    await writeWebForms(
      forms.map((item) =>
        item.id === input.form.id
          ? { ...item, usageCount: item.usageCount + 1, updatedAt: nowIso }
          : item
      )
    );
  }

  await addAuditEvent({
    officeId: office.id,
    envelopeId,
    recipientId,
    type: "envelope_created",
    message: `${signerName} started signing via ${input.kind}`,
    ipAddress: null,
    userAgent: input.request.headers.get("user-agent"),
    metadata: { formId: input.form.id, formKind: input.kind, templateId: template.id },
  });

  return { envelope, signingToken };
}
