import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { canAccessOffice, canCreateEnvelopes, requireAdminApi } from "@/lib/auth";
import { sendSignatureRequestEmail } from "@/lib/email";
import { createPolicyPdf } from "@/lib/pdf";
import { convertUploadToPdf, detectSupportedUpload } from "@/lib/documentImport";
import { consumeRateLimit } from "@/lib/rateLimit";
import {
  addAuditEvent,
  createEnvelopeNumber,
  readEnvelopes,
  writeEnvelopes,
  getOfficeById,
} from "@/lib/store";
import { workflowConfig } from "@/lib/workflowConfig";
import type { EnvelopeRecord, RecipientType, TemplateRecord, WorkflowType } from "@/lib/types";
import {
  activateNextRecipients,
  buildRoleToRecipientMap,
  detectWorkflowIssues,
  issueRecipientSigningToken,
  mapTemplateRoleRecipients,
  normalizeWorkflow,
} from "@/lib/services/envelopeWorkflowService";
import { createTemplateService } from "@/lib/services/templateService";
import { resolveTemplatePdfForEnvelope } from "@/lib/services/templatePdfResolve";
import { roleForSigningStep } from "@/lib/recipientFormUtils";

const templateService = createTemplateService();

export const runtime = "nodejs";
const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;

type RecipientInput = {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  recipientType?: RecipientType;
  signingStep?: number;
  required?: boolean;
  templateRoleId?: string;
  role?: string;
};

type CleanedRecipient = {
  id: string;
  name: string;
  email: string;
  phone: string;
  recipientType: RecipientType;
  signingStep: number;
  required: boolean;
  templateRoleId: string | null;
  roleLabel: string;
};

function safeWorkflowType(input: string): WorkflowType {
  if (input === "parallel") return "parallel";
  if (input === "grouped") return "grouped";
  return "sequential";
}

function buildRecipientRows(
  cleaned: CleanedRecipient[],
  envelopeId: string,
  workflowType: WorkflowType
): EnvelopeRecord["recipients"] {
  return cleaned.map((item, index) => ({
    id: item.id,
    envelopeId,
    templateRoleId: item.templateRoleId,
    name: item.name,
    email: item.email,
    phone: item.phone || null,
    recipientType: item.recipientType,
    order: index + 1,
    signingStep: workflowType === "parallel" ? 1 : item.signingStep,
    stepGroup: null,
    status: "pending" as const,
    isRequired: item.required,
    activatedAt: null,
    completedAt: null,
    sentAt: null,
    viewedAt: null,
    signedAt: null,
    approvedAt: null,
    acknowledgedAt: null,
    declinedAt: null,
    declineReason: null,
    authenticationMethod: "none" as const,
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
    metadata: { roleLabel: item.roleLabel },
    signatureMethod: null,
    signerIpAddress: null,
    signerUserAgent: null,
    signerTimezone: null,
  }));
}

function applyTemplateToEnvelope(
  envelope: EnvelopeRecord,
  selectedTemplate: TemplateRecord,
  options?: { assignAllFieldsToSoleRecipient?: boolean }
) {
  envelope.templateVersionId = selectedTemplate.currentVersionId || null;
  envelope.fields = (selectedTemplate.fields || []).map((field) => ({
    id: crypto.randomUUID(),
    type: field.type,
    recipientId: "",
    templateRoleId: field.recipientRoleId,
    page: field.page,
    x: field.x,
    y: field.y,
    width: field.width,
    height: field.height,
    required: field.required,
    label: field.label,
    tooltip: field.tooltip,
    value: field.defaultValue || "",
  }));
  envelope.pageAssignments = (selectedTemplate.pageAssignments || []).map((assignment) => ({
    id: crypto.randomUUID(),
    pageNumber: assignment.pageNumber,
    pageLabel: assignment.pageLabel,
    assignedRecipientIds: [] as string[],
    assignedTemplateRoleIds: assignment.assignedRoleIds,
    responsibilityType: assignment.responsibilityType,
    visibility: assignment.visibility,
    isRequired: assignment.isRequired,
    signingStep: assignment.signingStep,
    allowComments: assignment.allowComments,
    allowAttachments: assignment.allowAttachments,
    readOnly: assignment.readOnly,
  }));

  if (options?.assignAllFieldsToSoleRecipient && envelope.recipients.length === 1) {
    const soleId = envelope.recipients[0].id;
    for (const field of envelope.fields) {
      field.recipientId = soleId;
    }
    for (const assignment of envelope.pageAssignments) {
      assignment.assignedRecipientIds = [soleId];
      assignment.assignedTemplateRoleIds = [];
    }
    return null;
  }

  const roleMap: Record<string, string[]> = {};
  for (const recipient of envelope.recipients) {
    if (!recipient.templateRoleId) continue;
    roleMap[recipient.templateRoleId] ||= [];
    roleMap[recipient.templateRoleId].push(recipient.id);
  }
  for (const role of selectedTemplate.recipientRoles || []) {
    if (role.isRequired && (!roleMap[role.id] || roleMap[role.id].length === 0)) {
      return `Required template role is not assigned: ${role.roleName}.`;
    }
    if (roleMap[role.id] && roleMap[role.id].length > 1 && role.roleType !== "receives_copy") {
      return `Role allows only one recipient: ${role.roleName}.`;
    }
  }
  return null;
}

async function maybeSendNow(
  envelope: EnvelopeRecord,
  envelopes: EnvelopeRecord[],
  nowIso: string,
  officeId: string
) {
  let emailWarning: string | undefined;
  const activated = activateNextRecipients(envelope);
  for (const recipient of activated) {
    const rawToken = issueRecipientSigningToken(recipient);
    recipient.sentAt = nowIso;
    const result = await sendSignatureRequestEmail(envelope, recipient, rawToken);
    await addAuditEvent({
      officeId,
      envelopeId: envelope.id,
      recipientId: recipient.id,
      type: result.sent ? "invitation_sent" : "invitation_failed",
      message: result.sent
        ? `Signing invitation sent to ${recipient.email}`
        : `Invitation failed for ${recipient.email}: ${result.reason}`,
      ipAddress: null,
      userAgent: null,
    });
    if (!result.sent) emailWarning = `Envelope created, but invitation was not sent: ${result.reason}`;
  }
  await writeEnvelopes(envelopes);
  return emailWarning;
}

export async function POST(request: Request) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!canCreateEnvelopes(session)) {
    return NextResponse.json({ error: "Your portal role cannot create envelopes." }, { status: 403 });
  }

  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const limiter = consumeRateLimit({
    key: `doc-create:${session.userId}:${ip}`,
    windowSeconds: workflowConfig.signingRateLimitWindowSeconds,
    maxRequests: workflowConfig.signingRateLimitMaxRequests,
  });
  if (!limiter.allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait and try again." }, { status: 429 });
  }

  try {
    const formData = await request.formData();
    const officeId = String(formData.get("officeId") || session.officeId || "").trim();
    const title = String(formData.get("title") || "").trim();
    const message = String(formData.get("message") || "").trim();
    const category = String(formData.get("category") || "").trim() || null;
    const reminderFrequency = String(formData.get("reminderFrequency") || "none").trim() || "none";
    const templateId = String(formData.get("templateId") || "").trim();
    const workflowType = safeWorkflowType(String(formData.get("workflowType") || "sequential"));
    const sendNow = formData.get("sendNow") === "on";
    const bulkSend = formData.get("bulkSend") === "1" || formData.get("bulk") === "1";
    const documentMode = String(formData.get("documentMode") || "upload");
    const documentText = String(formData.get("documentText") || "").trim();
    const pdfFile = formData.get("pdfFile");
    let recipientInputs: RecipientInput[] = [];
    try {
      recipientInputs = JSON.parse(String(formData.get("recipients") || "[]")) as RecipientInput[];
    } catch {
      recipientInputs = [];
    }

    if (!officeId || !canAccessOffice(session, officeId)) {
      return NextResponse.json({ error: "Select an office workspace you are allowed to access." }, { status: 403 });
    }
    const office = await getOfficeById(officeId);
    if (!office || !office.isActive) {
      return NextResponse.json({ error: "The selected office is unavailable or disabled." }, { status: 400 });
    }
    if (!title) return NextResponse.json({ error: "Document title is required." }, { status: 400 });

    let selectedTemplate: TemplateRecord | null = null;
    if (templateId) {
      const template = await templateService.getById(templateId);
      selectedTemplate =
        template && (template.status === "published" || template.status === "draft") ? template : null;
      if (!selectedTemplate) {
        return NextResponse.json({ error: "Selected template is unavailable." }, { status: 400 });
      }
    }

    const hasUploadedFile = pdfFile instanceof File && pdfFile.size > 0;
    const hasTemplateDocuments = Boolean(selectedTemplate?.documents?.some((doc) => doc.filePath));
    const wantsWrite = documentMode === "write";
    const wantsTemplateDocs = documentMode === "template" || (!hasUploadedFile && !wantsWrite && hasTemplateDocuments);

    if (wantsWrite && documentText.length < 20 && !hasTemplateDocuments) {
      return NextResponse.json({ error: "Write at least 20 characters of policy or agreement content." }, { status: 400 });
    }
    if (!hasUploadedFile && !wantsWrite && !hasTemplateDocuments) {
      return NextResponse.json({ error: "Upload a document, choose Write, or start from a template with documents." }, { status: 400 });
    }
    if (wantsTemplateDocs && !hasTemplateDocuments) {
      return NextResponse.json({ error: "Selected template has no uploaded documents." }, { status: 400 });
    }
    if (hasUploadedFile && pdfFile.size > MAX_UPLOAD_SIZE) {
      return NextResponse.json({ error: "Document must be 20 MB or smaller." }, { status: 400 });
    }
    if (hasUploadedFile && !detectSupportedUpload(pdfFile.name, pdfFile.type)) {
      return NextResponse.json({ error: "Unsupported file type. Upload PDF, Word (.docx), text (.txt), PNG, JPG, or JPEG." }, { status: 400 });
    }

    const cleaned: CleanedRecipient[] = recipientInputs
      .map((item, index) => {
        const signingStep = Math.max(1, Number(item.signingStep || (workflowType === "parallel" ? 1 : index + 1)));
        return {
          id: item.id || crypto.randomUUID(),
          name: String(item.name || "").trim(),
          email: String(item.email || "").trim().toLowerCase(),
          phone: String(item.phone || "").trim(),
          recipientType: (item.recipientType || "signer") as RecipientType,
          signingStep,
          required: item.required !== false,
          templateRoleId: item.templateRoleId || null,
          roleLabel: String(item.role || "").trim() || roleForSigningStep(signingStep),
        };
      })
      .filter((item) => item.name && /^\S+@\S+\.\S+$/.test(item.email));

    if (cleaned.length === 0 || cleaned.length !== recipientInputs.length) {
      return NextResponse.json({ error: "Please provide valid recipients." }, { status: 400 });
    }
    if (!bulkSend && cleaned.length > workflowConfig.maxRecipientsPerEnvelope) {
      return NextResponse.json(
        { error: `Recipient limit exceeded. Maximum recipients per envelope: ${workflowConfig.maxRecipientsPerEnvelope}.` },
        { status: 400 }
      );
    }
    if (cleaned.length > workflowConfig.maxManualRecipientsPerRequest) {
      return NextResponse.json(
        { error: `Manual recipient limit exceeded. Maximum recipients per request: ${workflowConfig.maxManualRecipientsPerRequest}.` },
        { status: 400 }
      );
    }
    const duplicateCheck = new Set<string>();
    for (const recipient of cleaned) {
      if (duplicateCheck.has(recipient.email)) {
        return NextResponse.json({ error: `Duplicate recipient email detected: ${recipient.email}` }, { status: 400 });
      }
      duplicateCheck.add(recipient.email);
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const originalDirectory = path.join(process.cwd(), "storage", "offices", officeId, "original");
    await mkdir(originalDirectory, { recursive: true });
    let uploadedOriginalName = `${title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "policy"}.pdf`;

    async function resolveSharedPdfBytes(recipientsForPdf: CleanedRecipient[]) {
      if (hasUploadedFile) {
        const converted = await convertUploadToPdf({
          bytes: Buffer.from(await (pdfFile as File).arrayBuffer()),
          fileName: (pdfFile as File).name,
          mimeType: (pdfFile as File).type,
          title,
        });
        uploadedOriginalName = (pdfFile as File).name;
        return Buffer.from(converted.pdfBytes);
      }
      if ((wantsTemplateDocs || (wantsWrite && hasTemplateDocuments && documentText.length < 20)) && selectedTemplate) {
        const resolved = await resolveTemplatePdfForEnvelope({
          template: selectedTemplate,
          officeName: office!.name,
          title,
          recipients: recipientsForPdf.map((item) => ({ name: item.name, email: item.email })),
        });
        uploadedOriginalName = resolved.originalFileName;
        return Buffer.from(resolved.bytes);
      }
      if (wantsWrite) {
        return Buffer.from(
          await createPolicyPdf({
            officeName: office!.name,
            title,
            content: documentText,
            recipients: recipientsForPdf.map((item) => ({ name: item.name, email: item.email })),
          })
        );
      }
      throw new Error("No document source");
    }

    const envelopes = await readEnvelopes();
    const userAgent = request.headers.get("user-agent");

    // —— Bulk send: one independent envelope + PDF per recipient ——
    if (bulkSend) {
      if (cleaned.length < 1) {
        return NextResponse.json({ error: "Add at least one recipient for bulk send." }, { status: 400 });
      }

      const bulkBatchId = crypto.randomUUID();
      const createdIds: string[] = [];
      let emailWarning: string | undefined;
      const useSharedBytes = hasUploadedFile || Boolean(selectedTemplate?.documents?.some((doc) => doc.filePath));
      const sharedBytes = useSharedBytes ? await resolveSharedPdfBytes(cleaned) : null;

      for (const person of cleaned) {
        const envelopeId = crypto.randomUUID();
        const recipientId = crypto.randomUUID();
        const personCleaned: CleanedRecipient = {
          ...person,
          id: recipientId,
          signingStep: 1,
          templateRoleId: person.templateRoleId || selectedTemplate?.recipientRoles?.[0]?.id || null,
        };
        const fileBytes =
          sharedBytes ||
          (await resolveSharedPdfBytes([personCleaned]));
        const fileName = `${envelopeId}.pdf`;
        await writeFile(path.join(originalDirectory, fileName), fileBytes);

        const envelopeTitle = `${title} — ${person.name}`;
        const envelope: EnvelopeRecord = {
          schemaVersion: 2,
          id: envelopeId,
          officeId,
          officeName: office.name,
          envelopeNumber: createEnvelopeNumber(office.slug),
          title: envelopeTitle,
          message,
          category,
          reminderFrequency,
          originalFileName: uploadedOriginalName,
          originalPdfPath: `storage/offices/${officeId}/original/${fileName}`,
          workingPdfPath: null,
          signedPdfPath: null,
          workflowType: "parallel",
          declineBehavior: "stop_envelope",
          templateId: templateId || null,
          templateVersionId: null,
          status: "draft",
          createdAt: nowIso,
          updatedAt: nowIso,
          sentAt: null,
          completedAt: null,
          voidedAt: null,
          voidReason: null,
          expiresAt: null,
          createdBy: session.name || session.email,
          createdByUserId: session.userId,
          recipients: buildRecipientRows([personCleaned], envelopeId, "parallel"),
          originalSha256: crypto.createHash("sha256").update(fileBytes).digest("hex"),
          signedSha256: null,
          certificateId: null,
          fields: [],
          pageAssignments: [],
          bulkBatchId,
          bulkBaseTitle: title,
        };

        if (selectedTemplate) {
          applyTemplateToEnvelope(envelope, selectedTemplate, { assignAllFieldsToSoleRecipient: true });
        }

        normalizeWorkflow(envelope);
        mapTemplateRoleRecipients(envelope, buildRoleToRecipientMap(envelope));
        if (envelope.recipients.length === 1) {
          const soleId = envelope.recipients[0].id;
          for (const field of envelope.fields || []) {
            if (!field.recipientId) field.recipientId = soleId;
          }
        }
        const issues = detectWorkflowIssues(envelope);
        if (issues.length) return NextResponse.json({ error: issues[0] }, { status: 400 });

        envelopes.push(envelope);
        createdIds.push(envelopeId);

        await addAuditEvent({
          officeId,
          envelopeId,
          recipientId: null,
          type: "envelope_created",
          message: `${session.name} created bulk envelope for ${person.name} in ${office.name}`,
          ipAddress: null,
          userAgent,
          metadata: { officeName: office.name, createdBy: session.email, workflowType: "parallel", bulkBatchId, bulk: true },
        });

        if (sendNow) {
          const warning = await maybeSendNow(envelope, envelopes, nowIso, officeId);
          if (warning) emailWarning = warning;
        }
      }

      if (!sendNow) {
        await writeEnvelopes(envelopes);
      }

      return NextResponse.json(
        {
          success: true,
          bulk: true,
          bulkBatchId,
          bulkCount: createdIds.length,
          envelopeIds: createdIds,
          envelopeId: createdIds[0],
          emailWarning,
        },
        { status: 201 }
      );
    }

    // —— Standard: one envelope, possibly multiple recipients ——
    const envelopeId = crypto.randomUUID();
    const fileName = `${envelopeId}.pdf`;
    const fileBytes = await resolveSharedPdfBytes(cleaned);
    await writeFile(path.join(originalDirectory, fileName), fileBytes);

    const envelope: EnvelopeRecord = {
      schemaVersion: 2,
      id: envelopeId,
      officeId,
      officeName: office.name,
      envelopeNumber: createEnvelopeNumber(office.slug),
      title,
      message,
      category,
      reminderFrequency,
      originalFileName: uploadedOriginalName,
      originalPdfPath: `storage/offices/${officeId}/original/${fileName}`,
      workingPdfPath: null,
      signedPdfPath: null,
      workflowType,
      declineBehavior: "stop_envelope",
      templateId: templateId || null,
      templateVersionId: null,
      status: "draft",
      createdAt: nowIso,
      updatedAt: nowIso,
      sentAt: null,
      completedAt: null,
      voidedAt: null,
      voidReason: null,
      expiresAt: null,
      createdBy: session.name || session.email,
      createdByUserId: session.userId,
      recipients: buildRecipientRows(cleaned, envelopeId, workflowType),
      originalSha256: crypto.createHash("sha256").update(fileBytes).digest("hex"),
      signedSha256: null,
      certificateId: null,
      fields: [],
      pageAssignments: [],
    };

    if (selectedTemplate) {
      const roleError = applyTemplateToEnvelope(envelope, selectedTemplate);
      if (roleError) return NextResponse.json({ error: roleError }, { status: 400 });
    }

    normalizeWorkflow(envelope);
    mapTemplateRoleRecipients(envelope, buildRoleToRecipientMap(envelope));
    const issues = detectWorkflowIssues(envelope);
    if (issues.length) return NextResponse.json({ error: issues[0] }, { status: 400 });

    envelopes.push(envelope);
    await writeEnvelopes(envelopes);
    await addAuditEvent({
      officeId,
      envelopeId,
      recipientId: null,
      type: "envelope_created",
      message: `${session.name} created the envelope in ${office.name}`,
      ipAddress: null,
      userAgent,
      metadata: { officeName: office.name, createdBy: session.email, workflowType },
    });
    await addAuditEvent({
      officeId,
      envelopeId,
      recipientId: null,
      type: "workflow_type_selected",
      message: `Workflow selected: ${workflowType}`,
      ipAddress: null,
      userAgent,
    });

    let emailWarning: string | undefined;
    if (sendNow) {
      emailWarning = await maybeSendNow(envelope, envelopes, nowIso, officeId);
    }

    return NextResponse.json({ success: true, envelopeId, emailWarning }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "The envelope could not be created." }, { status: 500 });
  }
}
