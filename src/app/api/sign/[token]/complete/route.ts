import { NextResponse } from "next/server";
import { sendCompletionEmail, sendSenderSignedEmail, sendSignatureRequestEmail } from "@/lib/email";
import { resolveSenderNotifyEmails } from "@/lib/senderNotify";
import { applyRecipientSignature, finalizeEnvelopePdf } from "@/lib/pdf";
import { consumeRateLimit } from "@/lib/rateLimit";
import {
  addAuditEvent,
  createAppNotification,
  findEnvelopeByToken,
  getClientIpAddress,
  isEnvelopeExpired,
  writeEnvelopes,
} from "@/lib/store";
import { workflowConfig } from "@/lib/workflowConfig";
import type { SignatureMethod } from "@/lib/types";
import { formatSignerLocalDate, resolveSignerTimeZone } from "@/lib/timezone";
import {
  activateNextRecipients,
  canRecipientAct,
  completeRecipientAction,
  evaluateEnvelopeCompletion,
  inferRecipientActionType,
  issueRecipientSigningToken,
  normalizeWorkflow,
} from "@/lib/services/envelopeWorkflowService";

const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;
const RUNTIME_SUPPORTED_FIELD_TYPES = new Set([
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

function parseSignature(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value.match(/^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_SIGNATURE_BYTES) return null;
  return { bytes, format: match[1] === "png" ? ("png" as const) : ("jpg" as const) };
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const ipAddress = getClientIpAddress(request);
  const limit = consumeRateLimit({
    key: `sign-complete:${ipAddress}`,
    windowSeconds: workflowConfig.signingRateLimitWindowSeconds,
    maxRequests: workflowConfig.signingRateLimitMaxRequests,
  });
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests. Please wait and retry." }, { status: 429 });

  const { token } = await params;
  const body = (await request.json()) as {
    consent?: boolean;
    signatureMethod?: SignatureMethod;
    signatureData?: string;
    initialsData?: string;
    fieldValues?: Record<string, string>;
    action?: "sign" | "approve" | "acknowledge";
    comment?: string;
    timeZone?: string;
    timezoneOffsetMinutes?: number;
    signedAtLocal?: string;
  };

  const found = await findEnvelopeByToken(token);
  if (!found) return NextResponse.json({ error: "Signing request not found." }, { status: 404 });
  normalizeWorkflow(found.envelope);

  if (isEnvelopeExpired(found.envelope)) return NextResponse.json({ error: "This signing link has expired." }, { status: 410 });
  if (["voided", "declined", "completed"].includes(found.envelope.status)) return NextResponse.json({ error: "This envelope is no longer available for signing." }, { status: 409 });
  if (!canRecipientAct(found.envelope, found.recipient)) return NextResponse.json({ error: "You are not authorized to act at this step yet." }, { status: 409 });
  if ((process.env.REQUIRE_EMAIL_OTP || "false").toLowerCase() === "true" && !found.recipient.otpVerifiedAt) {
    return NextResponse.json({ error: "Email verification is required before signing." }, { status: 403 });
  }

  const action = body.action || "sign";
  const actorAction = action === "approve" ? "approved" : action === "acknowledge" ? "acknowledged" : inferRecipientActionType(found.recipient);
  const now = new Date().toISOString();
  const recipientFields = (found.envelope.fields || []).filter((field) => field.recipientId === found.recipient.id);
  const values: Record<string, string> = {
    ...(body.fieldValues && typeof body.fieldValues === "object" ? body.fieldValues : {}),
  };
  for (const field of recipientFields) {
    const current = String(values[field.id] ?? "").trim();
    if (current) continue;
    if (field.type === "name" || field.type === "signer_name") values[field.id] = found.recipient.name;
    else if (field.type === "email" || field.type === "signer_email") values[field.id] = found.recipient.email;
    else if (field.type === "phone") values[field.id] = String(field.value || found.recipient.phone || "").trim();
    else if (field.value) values[field.id] = String(field.value);
  }
  const unsupportedField = recipientFields.find((field) => !RUNTIME_SUPPORTED_FIELD_TYPES.has(field.type));
  if (unsupportedField) {
    return NextResponse.json(
      { error: `Field type "${unsupportedField.type}" is not yet supported in Phase 2 signing runtime.` },
      { status: 409 }
    );
  }
  const unauthorizedField = Object.keys(values).find((fieldId) => !recipientFields.some((field) => field.id === fieldId));
  if (unauthorizedField) {
    await addAuditEvent({
      officeId: found.envelope.officeId,
      envelopeId: found.envelope.id,
      recipientId: found.recipient.id,
      type: "unauthorized_field_submission",
      message: `Recipient attempted to submit unauthorized field.`,
      ipAddress,
      userAgent: request.headers.get("user-agent"),
      metadata: { fieldId: unauthorizedField },
    });
    return NextResponse.json({ error: "You cannot submit fields assigned to another recipient." }, { status: 403 });
  }
  const missing = recipientFields.find((field) => {
    if (!field.required) return false;
    if (["signature", "initials", "witness_signature", "manager_signature", "office_admin_signature", "hr_signature", "notary_signature"].includes(field.type)) {
      return false;
    }
    const submitted = String(values[field.id] ?? "").trim();
    if (submitted) return false;
    if (field.type === "name" || field.type === "signer_name") return !found.recipient.name.trim();
    if (field.type === "email" || field.type === "signer_email") return !found.recipient.email.trim();
    if (field.type === "phone") return !String(field.value || found.recipient.phone || "").trim();
    if (["date", "signature_date", "auto_date"].includes(field.type)) return false;
    if (field.type === "checkbox" || field.type === "consent_checkbox") return true;
    return !String(field.value || "").trim();
  });
  if (missing) return NextResponse.json({ error: `Complete the required field: ${missing.label}.` }, { status: 400 });

  // Capture the signer's device clock / zone before PDF stamping.
  const offset =
    typeof body.timezoneOffsetMinutes === "number" && Number.isFinite(body.timezoneOffsetMinutes)
      ? body.timezoneOffsetMinutes
      : found.recipient.signerTimezoneOffsetMinutes ?? null;
  const zone = resolveSignerTimeZone({
    timeZone: body.timeZone || found.recipient.signerTimezone,
    timezoneOffsetMinutes: offset,
  });
  const localDisplay =
    (typeof body.signedAtLocal === "string" && body.signedAtLocal.trim()) ||
    formatSignerLocalDate({
      value: now,
      localDisplay: null,
      timeZone: zone,
      timezoneOffsetMinutes: offset,
    });
  found.recipient.signerTimezone = zone;
  found.recipient.signerTimezoneOffsetMinutes = offset;
  found.recipient.signerLocalTimeDisplay = localDisplay.slice(0, 120);
  found.recipient.signerIpAddress = ipAddress;
  found.recipient.signerUserAgent = request.headers.get("user-agent") || "unknown";

  if (actorAction === "signed") {
    if (body.consent !== true) return NextResponse.json({ error: "Electronic-signature consent is required." }, { status: 400 });
    if (!body.signatureMethod || !["drawn", "typed", "uploaded"].includes(body.signatureMethod)) {
      return NextResponse.json({ error: "Select a valid signature method." }, { status: 400 });
    }
    const signature = parseSignature(body.signatureData);
    if (!signature) return NextResponse.json({ error: "Provide a valid signature image no larger than 2 MB." }, { status: 400 });
    const hasInitialsFields = recipientFields.some((field) => field.type === "initials");
    const initials = parseSignature(body.initialsData);
    if (hasInitialsFields && !initials) {
      return NextResponse.json({ error: "Provide initials for the Initial fields." }, { status: 400 });
    }
    found.envelope.workingPdfPath = await applyRecipientSignature(found.envelope, found.recipient, {
      method: body.signatureMethod,
      imageBytes: signature.bytes,
      imageFormat: signature.format,
      initialsImageBytes: initials?.bytes,
      initialsImageFormat: initials?.format,
      fieldValues: values,
    });
    found.recipient.signatureMethod = body.signatureMethod;
  }

  completeRecipientAction({ envelope: found.envelope, recipient: found.recipient, action: actorAction });
  found.recipient.status = actorAction;
  found.recipient.completedAt = now;

  const completed = evaluateEnvelopeCompletion(found.envelope);
  if (!completed) {
    try {
      const activated = activateNextRecipients(found.envelope);
      for (const recipient of activated) {
        const rawToken = issueRecipientSigningToken(recipient);
        recipient.sentAt = now;
        const result = await sendSignatureRequestEmail(found.envelope, recipient, rawToken);
        await addAuditEvent({
          officeId: found.envelope.officeId,
          envelopeId: found.envelope.id,
          recipientId: recipient.id,
          type: result.sent ? "invitation_sent" : "invitation_failed",
          message: result.sent ? `Next signing invitation sent to ${recipient.email}` : `Invitation failed: ${result.reason}`,
          ipAddress: null,
          userAgent: null,
        });
      }
    } catch (error) {
      console.error("sign complete: next signer invite failed", error);
    }
  }

  if (completed) {
    // Retry once — certificate page must ship with the completed electronic record.
    let finalized = false;
    for (let attempt = 0; attempt < 2 && !finalized; attempt += 1) {
      try {
        const final = await finalizeEnvelopePdf(found.envelope);
        found.envelope.signedPdfPath = final.relativePath;
        found.envelope.certificateId = final.certificateId;
        found.envelope.originalSha256 = final.originalHash;
        found.envelope.signedSha256 = final.signedHash;
        finalized = true;
      } catch (error) {
        console.error(`sign complete: finalizeEnvelopePdf failed (attempt ${attempt + 1})`, error);
      }
    }
  }

  await writeEnvelopes(found.envelopes);

  // Side effects after save must not fail the signing response (VM SMTP / notify / audit issues).
  try {
    await addAuditEvent({
      officeId: found.envelope.officeId,
      envelopeId: found.envelope.id,
      recipientId: found.recipient.id,
      type: actorAction === "approved" ? "recipient_approved" : actorAction === "acknowledged" ? "recipient_acknowledged" : "recipient_signed",
      message: `${found.recipient.name} completed step action: ${actorAction}`,
      ipAddress,
      userAgent: found.recipient.signerUserAgent,
    });
  } catch (error) {
    console.error("sign complete: audit failed", error);
  }

  try {
    const notifyEmails = await resolveSenderNotifyEmails(found.envelope);
    const signedMail = await sendSenderSignedEmail(found.envelope, found.recipient, actorAction, notifyEmails);
    if (!signedMail.sent) {
      await addAuditEvent({
        officeId: found.envelope.officeId,
        envelopeId: found.envelope.id,
        recipientId: found.recipient.id,
        type: "email_failed",
        message: `Signed notice to office failed: ${signedMail.reason}`,
        ipAddress: null,
        userAgent: null,
      });
    }
  } catch (error) {
    console.error("sign complete: signed email failed", error);
  }

  try {
    const { dispatchEnvelopeIntegrations } = await import("@/lib/integrationsDispatch");
    await dispatchEnvelopeIntegrations({
      officeId: found.envelope.officeId,
      event: "recipient.signed",
      envelope: found.envelope,
      extra: {
        recipientId: found.recipient.id,
        recipientName: found.recipient.name,
        recipientEmail: found.recipient.email,
        action: actorAction,
      },
    });
  } catch (error) {
    console.error("sign complete: recipient.signed webhook failed", error);
  }

  const actionLabel = actorAction === "signed" ? "signed" : actorAction === "approved" ? "approved" : "acknowledged";
  await createAppNotification({
    officeId: found.envelope.officeId,
    envelopeId: found.envelope.id,
    type:
      actorAction === "approved"
        ? "recipient_approved"
        : actorAction === "acknowledged"
          ? "recipient_acknowledged"
          : "recipient_signed",
    title: `Recipient ${actionLabel}`,
    message: `${found.recipient.name} ${actionLabel} "${found.envelope.title}"`,
  });

  if (completed) {
    await createAppNotification({
      officeId: found.envelope.officeId,
      envelopeId: found.envelope.id,
      type: "envelope_completed",
      title: "Contract completed",
      message: `"${found.envelope.title}" is fully signed`,
    });
    try {
      await addAuditEvent({
        officeId: found.envelope.officeId,
        envelopeId: found.envelope.id,
        recipientId: null,
        type: "envelope_completed",
        message: "All required recipient actions are completed.",
        ipAddress: null,
        userAgent: null,
      });
    } catch (error) {
      console.error("sign complete: completion audit failed", error);
    }
    // Always email every participant (signers + receives_copy), one message each.
    try {
      const mailRecipients = found.envelope.recipients.filter(
        (recipient) => recipient.email && recipient.status !== "declined"
      );
      const result = await sendCompletionEmail(found.envelope, mailRecipients);
      if (!result.sent) {
        await addAuditEvent({
          officeId: found.envelope.officeId,
          envelopeId: found.envelope.id,
          recipientId: null,
          type: "email_failed",
          message: `Completion email failed: ${result.reason}`,
          ipAddress: null,
          userAgent: null,
        });
      } else {
        await addAuditEvent({
          officeId: found.envelope.officeId,
          envelopeId: found.envelope.id,
          recipientId: null,
          type: "invitation_sent",
          message: `Completion email sent to ${mailRecipients.length} recipient(s)${result.reason ? ` (${result.reason})` : ""}`,
          ipAddress: null,
          userAgent: null,
        });
      }
    } catch (error) {
      console.error("sign complete: completion email failed", error);
    }
    try {
      const { markSubmissionCompletedByEnvelope } = await import("@/lib/services/powerFormSubmissionService");
      await markSubmissionCompletedByEnvelope(found.envelope.id);
    } catch {
      // Non-PowerForm envelopes ignore this.
    }
    try {
      const { dispatchEnvelopeIntegrations } = await import("@/lib/integrationsDispatch");
      const results = await dispatchEnvelopeIntegrations({
        officeId: found.envelope.officeId,
        event: "envelope.completed",
        envelope: found.envelope,
        extra: {
          recipientId: found.recipient.id,
          recipientName: found.recipient.name,
          recipientEmail: found.recipient.email,
        },
      });
      // Also try network-level integrations for office envelopes (super-admin setup).
      if (found.envelope.officeId) {
        const network = await dispatchEnvelopeIntegrations({
          officeId: "",
          event: "envelope.completed",
          envelope: found.envelope,
          extra: { recipientId: found.recipient.id },
        });
        results.push(...network);
      }
      for (const result of results) {
        if (!result.ok) {
          console.warn("[integrations]", result.kind, result.detail);
        }
      }
    } catch (error) {
      console.error("sign complete: integrations dispatch failed", error);
    }
  }

  return NextResponse.json({ success: true, completed, action: actorAction });
}

