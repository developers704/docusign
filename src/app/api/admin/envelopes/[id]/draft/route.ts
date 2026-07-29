import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { canAccessOffice, canCreateEnvelopes, requireAdminApi } from "@/lib/auth";
import { actionToRecipientType, roleForSigningStep } from "@/lib/recipientFormUtils";
import { addAuditEvent, readEnvelopes, writeEnvelopes } from "@/lib/store";
import type { RecipientRecord, RecipientType, WorkflowType } from "@/lib/types";

type RecipientInput = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  signingStep?: number;
  required?: boolean;
  templateRoleId?: string;
  action?: string;
  recipientType?: RecipientType;
  role?: string;
};

function newDraftRecipient(item: RecipientInput, envelopeId: string, index: number): RecipientRecord {
  const signingStep = Math.max(1, Number(item.signingStep) || index + 1);
  const roleLabel = item.role?.trim() || roleForSigningStep(signingStep);
  return {
    id: item.id || crypto.randomUUID(),
    envelopeId,
    templateRoleId: item.templateRoleId || null,
    name: item.name.trim(),
    email: item.email.trim().toLowerCase(),
    phone: item.phone?.trim() || null,
    recipientType: item.recipientType || actionToRecipientType(item.action),
    order: index + 1,
    signingStep,
    stepGroup: null,
    status: "pending",
    isRequired: item.required !== false,
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
    metadata: { roleLabel },
    signatureMethod: null,
    signerIpAddress: null,
    signerUserAgent: null,
    signerTimezone: null,
  };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!canCreateEnvelopes(session)) {
    return NextResponse.json({ error: "Your role cannot edit envelopes." }, { status: 403 });
  }

  const { id } = await params;
  const envelopes = await readEnvelopes();
  const envelope = envelopes.find((item) => item.id === id);
  if (!envelope || !canAccessOffice(session, envelope.officeId)) {
    return NextResponse.json({ error: "Envelope not found." }, { status: 404 });
  }
  if (envelope.status !== "draft") {
    return NextResponse.json({ error: "Only draft envelopes can be edited." }, { status: 409 });
  }

  const body = (await request.json()) as {
    title?: string;
    message?: string;
    category?: string;
    reminderFrequency?: string;
    workflowType?: WorkflowType;
    recipients?: RecipientInput[];
  };

  if (typeof body.title === "string" && body.title.trim()) {
    envelope.title = body.title.trim().slice(0, 200);
  }
  if (typeof body.message === "string") {
    envelope.message = body.message.trim().slice(0, 2000);
  }
  if (typeof body.category === "string") {
    envelope.category = body.category.trim().slice(0, 80) || null;
  }
  if (typeof body.reminderFrequency === "string") {
    envelope.reminderFrequency = body.reminderFrequency.slice(0, 40) || null;
  }
  if (body.workflowType === "sequential" || body.workflowType === "parallel" || body.workflowType === "grouped") {
    envelope.workflowType = body.workflowType;
  }

  if (Array.isArray(body.recipients) && body.recipients.length) {
    const cleaned = body.recipients.filter(
      (item) => item && typeof item.id === "string" && item.name?.trim() && item.email?.trim()
    );
    if (!cleaned.length) {
      return NextResponse.json({ error: "Please provide valid recipients." }, { status: 400 });
    }
    const existingById = new Map(envelope.recipients.map((recipient) => [recipient.id, recipient]));
    envelope.recipients = cleaned.map((item, index) => {
      const existing = existingById.get(item.id);
      if (existing) {
        const signingStep = Math.max(1, Number(item.signingStep) || index + 1);
        const roleLabel = item.role?.trim() || roleForSigningStep(signingStep);
        return {
          ...existing,
          name: item.name.trim(),
          email: item.email.trim().toLowerCase(),
          phone: item.phone?.trim() || null,
          recipientType: item.recipientType || actionToRecipientType(item.action),
          order: index + 1,
          signingStep,
          isRequired: item.required !== false,
          templateRoleId: item.templateRoleId || existing.templateRoleId || null,
          metadata: { ...(existing.metadata || {}), roleLabel },
        };
      }
      return newDraftRecipient(item, envelope.id, index);
    });
  }

  envelope.updatedAt = new Date().toISOString();
  await writeEnvelopes(envelopes);
  await addAuditEvent({
    officeId: envelope.officeId,
    envelopeId: envelope.id,
    recipientId: null,
    type: "envelope_created",
    message: `${session.name} updated draft recipients`,
    ipAddress: null,
    userAgent: request.headers.get("user-agent"),
    metadata: { recipients: envelope.recipients.length },
  });

  return NextResponse.json({ success: true, envelopeId: envelope.id });
}
