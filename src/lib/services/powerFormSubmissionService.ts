import crypto from "node:crypto";
import { getPowerFormRepositories } from "@/lib/repositories/jsonPowerFormRepositories";
import { POWERFORM_SCHEMA_VERSION, normalizePowerFormRecord } from "@/lib/powerFormNormalize";
import {
  assertAccessTypeSupported,
  createEmailVerificationChallenge,
  verifyAccessCode,
  verifyEmailChallenge,
} from "@/lib/services/powerFormAccessService";
import { createEnvelopeForPowerFormSubmission } from "@/lib/services/powerFormEnvelopeService";
import { notifyPowerFormOwnerOfSubmission } from "@/lib/services/powerFormNotificationService";
import { refreshPowerFormAnalytics } from "@/lib/services/powerFormAnalyticsService";
import {
  assertPowerFormAcceptingSubmissions,
  validateIntakeValues,
} from "@/lib/services/powerFormValidationService";
import type { PowerFormRecord, PowerFormSubmissionRecord } from "@/lib/types";
import { getClientIpAddress } from "@/lib/store";

export type StartPowerFormInput = {
  slug: string;
  intake: Record<string, string>;
  accessCode?: string;
  consentAccepted?: boolean;
  emailChallengeId?: string;
  emailVerificationCode?: string;
  request: Request;
};

async function bumpFormSubmissionCount(form: PowerFormRecord, atIso: string) {
  const repos = getPowerFormRepositories();
  const next = normalizePowerFormRecord({
    ...form,
    submissionCount: (form.submissionCount || 0) + 1,
    usageCount: (form.submissionCount || 0) + 1,
    lastSubmissionAt: atIso,
    updatedAt: atIso,
  });
  await repos.forms.update(next);
  return next;
}

async function createSubmissionShell(input: {
  form: PowerFormRecord;
  intake: Record<string, string>;
  request: Request;
  consentAccepted?: boolean;
  status: PowerFormSubmissionRecord["status"];
}) {
  const now = new Date().toISOString();
  const submission: PowerFormSubmissionRecord = {
    schemaVersion: POWERFORM_SCHEMA_VERSION,
    id: crypto.randomUUID(),
    powerFormId: input.form.id,
    officeId: input.form.officeId,
    envelopeId: null,
    submittedByName: input.intake.name || "",
    submittedByEmail: (input.intake.email || "").toLowerCase(),
    submittedByPhone: input.intake.phone || null,
    intakeValues: input.intake,
    status: input.status,
    startedAt: now,
    verifiedAt: input.status === "verified" || input.status === "envelope_created" ? now : null,
    envelopeCreatedAt: null,
    completedAt: null,
    cancelledAt: null,
    ipAddress: getClientIpAddress(input.request),
    userAgent: input.request.headers.get("user-agent"),
    consentAcceptedAt: input.consentAccepted ? now : null,
    consentTextVersion: input.consentAccepted ? input.form.consentText.slice(0, 120) : null,
    verificationAttemptCount: 0,
    verificationLockedUntil: null,
    createdAt: now,
    updatedAt: now,
  };
  const repos = getPowerFormRepositories();
  await repos.submissions.create(submission);
  return submission;
}

/**
 * Public PowerForm start: validates access + intake, creates a unique envelope, returns sign URL.
 * Never reuses envelopes across submissions.
 */
export async function startPowerFormSubmission(input: StartPowerFormInput) {
  const repos = getPowerFormRepositories();
  const form = await repos.forms.getBySlug(input.slug);
  if (!form) throw new Error("PowerForm not found.");

  assertPowerFormAcceptingSubmissions(form);
  assertAccessTypeSupported(form);

  if (form.accessType === "access_code" || form.requireAccessCode) {
    verifyAccessCode(form, String(input.accessCode || ""));
  }

  const intake = validateIntakeValues(form, input.intake, { consentAccepted: input.consentAccepted });

  if (form.accessType === "email_verified" || form.requireEmailVerification) {
    if (!input.emailChallengeId || !input.emailVerificationCode) {
      const submission = await createSubmissionShell({
        form,
        intake,
        request: input.request,
        consentAccepted: input.consentAccepted,
        status: "awaiting_verification",
      });
      const challenge = await createEmailVerificationChallenge({
        form,
        email: intake.email,
        submissionId: submission.id,
      });
      return {
        requiresVerification: true as const,
        submissionId: submission.id,
        challengeId: challenge.challengeId,
        expiresAt: challenge.expiresAt,
        message: "Enter the verification code sent to your email.",
      };
    }
    await verifyEmailChallenge({
      challengeId: input.emailChallengeId,
      code: input.emailVerificationCode,
      powerFormId: form.id,
    });
  }

  const submission = await createSubmissionShell({
    form,
    intake,
    request: input.request,
    consentAccepted: input.consentAccepted,
    status: "verified",
  });

  try {
    const { envelope, signingToken } = await createEnvelopeForPowerFormSubmission({
      form,
      intake,
      request: input.request,
      submissionId: submission.id,
    });

    const now = new Date().toISOString();
    const updated: PowerFormSubmissionRecord = {
      ...submission,
      envelopeId: envelope.id,
      status: "signing",
      envelopeCreatedAt: now,
      updatedAt: now,
    };
    await repos.submissions.update(updated);
    await bumpFormSubmissionCount(form, now);
    await refreshPowerFormAnalytics(form.id);
    await notifyPowerFormOwnerOfSubmission({
      to: form.createdByEmail,
      formName: form.name,
      signerName: intake.name,
      signerEmail: intake.email,
      envelopeId: envelope.id,
    });

    return {
      requiresVerification: false as const,
      submissionId: updated.id,
      envelopeId: envelope.id,
      signUrl: `/sign/${encodeURIComponent(signingToken)}`,
      successMessage: form.successMessage,
      redirectUrl: form.redirectUrl,
    };
  } catch (error) {
    await repos.submissions.update({
      ...submission,
      status: "failed",
      updatedAt: new Date().toISOString(),
    });
    throw error;
  }
}

export async function completeEmailVerifiedStart(input: {
  slug: string;
  submissionId: string;
  challengeId: string;
  code: string;
  request: Request;
}) {
  const repos = getPowerFormRepositories();
  const form = await repos.forms.getBySlug(input.slug);
  if (!form) throw new Error("PowerForm not found.");
  assertPowerFormAcceptingSubmissions(form);

  const submission = await repos.submissions.getById(input.submissionId);
  if (!submission || submission.powerFormId !== form.id) throw new Error("Submission not found.");
  if (submission.envelopeId) throw new Error("This submission already created an envelope.");

  await verifyEmailChallenge({
    challengeId: input.challengeId,
    code: input.code,
    powerFormId: form.id,
  });

  const intake = submission.intakeValues;
  const { envelope, signingToken } = await createEnvelopeForPowerFormSubmission({
    form,
    intake,
    request: input.request,
    submissionId: submission.id,
  });

  const now = new Date().toISOString();
  await repos.submissions.update({
    ...submission,
    status: "signing",
    verifiedAt: now,
    envelopeId: envelope.id,
    envelopeCreatedAt: now,
    updatedAt: now,
  });
  await bumpFormSubmissionCount(form, now);
  await refreshPowerFormAnalytics(form.id);

  return {
    submissionId: submission.id,
    envelopeId: envelope.id,
    signUrl: `/sign/${encodeURIComponent(signingToken)}`,
  };
}

export async function markSubmissionCompletedByEnvelope(envelopeId: string) {
  const repos = getPowerFormRepositories();
  const submission = await repos.submissions.getByEnvelopeId(envelopeId);
  if (!submission) return null;
  if (submission.status === "completed") return submission;
  const now = new Date().toISOString();
  const updated = await repos.submissions.update({
    ...submission,
    status: "completed",
    completedAt: now,
    updatedAt: now,
  });
  await refreshPowerFormAnalytics(submission.powerFormId);
  return updated;
}

export async function listSubmissionsForPowerForm(powerFormId: string) {
  return getPowerFormRepositories().submissions.listByPowerFormId(powerFormId);
}
