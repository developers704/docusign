import crypto from "node:crypto";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { canAccessOffice, canCreateEnvelopes, requireAdminApi } from "@/lib/auth";
import { addAuditEvent, createEnvelopeNumber, readEnvelopes, writeEnvelopes } from "@/lib/store";
import type { EnvelopeRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveSourcePdf(envelope: EnvelopeRecord) {
  if (envelope.status === "completed" && envelope.signedPdfPath) return envelope.signedPdfPath;
  return envelope.workingPdfPath || envelope.originalPdfPath;
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!canCreateEnvelopes(session)) {
    return NextResponse.json({ error: "Your role cannot copy contracts." }, { status: 403 });
  }

  const { id } = await params;
  const envelopes = await readEnvelopes();
  const source = envelopes.find((item) => item.id === id);
  if (!source || !canAccessOffice(session, source.officeId)) {
    return NextResponse.json({ error: "Contract not found." }, { status: 404 });
  }

  const sourceRelative = resolveSourcePdf(source);
  if (!sourceRelative) {
    return NextResponse.json({ error: "This contract has no document to copy." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const envelopeId = crypto.randomUUID();
  const originalDirectory = path.join(process.cwd(), "storage", "offices", source.officeId, "original");
  await mkdir(originalDirectory, { recursive: true });
  const fileName = `${envelopeId}.pdf`;
  const relativePath = `storage/offices/${source.officeId}/original/${fileName}`;
  const sourceAbsolute = path.isAbsolute(sourceRelative)
    ? sourceRelative
    : path.join(process.cwd(), sourceRelative);
  try {
    await copyFile(sourceAbsolute, path.join(originalDirectory, fileName));
  } catch {
    return NextResponse.json({ error: "Could not copy the original document file." }, { status: 500 });
  }

  const recipientIdMap = new Map<string, string>();
  const blankRecipients: EnvelopeRecord["recipients"] =
    source.recipients.length > 0
      ? source.recipients.map((recipient, index) => {
          const newId = crypto.randomUUID();
          recipientIdMap.set(recipient.id, newId);
          return {
            ...recipient,
            id: newId,
            envelopeId,
            name: "",
            email: "",
            phone: null,
            order: index + 1,
            status: "pending",
            activatedAt: null,
            completedAt: null,
            sentAt: null,
            viewedAt: null,
            signedAt: null,
            approvedAt: null,
            acknowledgedAt: null,
            declinedAt: null,
            declineReason: null,
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
            signatureMethod: null,
            signerIpAddress: null,
            signerUserAgent: null,
            signerTimezone: null,
          };
        })
      : [
          {
            id: crypto.randomUUID(),
            envelopeId,
            templateRoleId: null,
            name: "",
            email: "",
            phone: null,
            recipientType: "signer",
            order: 1,
            signingStep: 1,
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
            metadata: { roleLabel: "Signer" },
            signatureMethod: null,
            signerIpAddress: null,
            signerUserAgent: null,
            signerTimezone: null,
          },
        ];

  const fields = (source.fields || []).map((field) => ({
    ...field,
    id: crypto.randomUUID(),
    recipientId: recipientIdMap.get(field.recipientId) || blankRecipients[0]?.id || field.recipientId,
  }));

  const copy: EnvelopeRecord = {
    schemaVersion: source.schemaVersion || 2,
    id: envelopeId,
    officeId: source.officeId,
    officeName: source.officeName,
    envelopeNumber: createEnvelopeNumber(),
    title: source.title.endsWith(" (Copy)") ? source.title : `${source.title} (Copy)`,
    message: source.message,
    category: source.category || null,
    reminderFrequency: source.reminderFrequency || "every_day",
    originalFileName: source.originalFileName || "document.pdf",
    originalPdfPath: relativePath,
    workingPdfPath: null,
    signedPdfPath: null,
    workflowType: source.workflowType || "sequential",
    declineBehavior: source.declineBehavior,
    templateId: source.templateId || null,
    templateVersionId: source.templateVersionId || null,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    sentAt: null,
    scheduledSendAt: null,
    scheduledTimezone: null,
    completedAt: null,
    voidedAt: null,
    voidReason: null,
    expiresAt: null,
    createdBy: session.email,
    createdByUserId: session.userId,
    recipients: blankRecipients,
    originalSha256: source.originalSha256,
    signedSha256: null,
    certificateId: null,
    fields,
    pageAssignments: (source.pageAssignments || []).map((assignment) => ({
      ...assignment,
      id: crypto.randomUUID(),
      assignedRecipientIds: assignment.assignedRecipientIds
        .map((rid) => recipientIdMap.get(rid))
        .filter((rid): rid is string => Boolean(rid)),
    })),
    preparedAt: fields.length ? now : null,
    bulkBatchId: null,
    bulkBaseTitle: null,
  };

  envelopes.push(copy);
  await writeEnvelopes(envelopes);
  await addAuditEvent({
    officeId: copy.officeId,
    envelopeId: copy.id,
    recipientId: null,
    type: "envelope_created",
    message: `${session.name} copied contract from ${source.envelopeNumber}`,
    ipAddress: null,
    userAgent: _request.headers.get("user-agent"),
    metadata: { action: "copy", sourceEnvelopeId: source.id },
  });

  return NextResponse.json({ success: true, envelopeId: copy.id });
}
