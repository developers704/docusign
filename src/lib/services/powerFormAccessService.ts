import crypto from "node:crypto";
import { getPowerFormRepositories } from "@/lib/repositories/jsonPowerFormRepositories";
import { POWERFORM_SCHEMA_VERSION } from "@/lib/powerFormNormalize";
import { hashToken } from "@/lib/store";
import type { PowerFormAccessChallengeRecord, PowerFormRecord } from "@/lib/types";
import { sendPowerFormVerificationEmail } from "@/lib/services/powerFormNotificationService";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const OTP_TTL_MINUTES = 15;

function lockUntilIso() {
  return new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString();
}

function assertNotLocked(challenge: PowerFormAccessChallengeRecord) {
  if (challenge.lockedUntil && new Date(challenge.lockedUntil).getTime() > Date.now()) {
    throw new Error("Too many attempts. Try again later.");
  }
}

async function bumpFailure(challenge: PowerFormAccessChallengeRecord) {
  const repos = getPowerFormRepositories();
  const attemptCount = challenge.attemptCount + 1;
  const next: PowerFormAccessChallengeRecord = {
    ...challenge,
    attemptCount,
    lockedUntil: attemptCount >= MAX_ATTEMPTS ? lockUntilIso() : challenge.lockedUntil,
    updatedAt: new Date().toISOString(),
  };
  await repos.access.update(next);
  if (attemptCount >= MAX_ATTEMPTS) throw new Error("Too many attempts. Try again later.");
  throw new Error("Invalid code.");
}

export function verifyAccessCode(form: PowerFormRecord, code: string) {
  if (!form.requireAccessCode && form.accessType !== "access_code") return true;
  if (!form.accessCodeHash) throw new Error("This PowerForm is misconfigured (missing access code).");
  const provided = String(code || "").trim();
  if (!provided) throw new Error("Access code is required.");
  if (hashToken(provided) !== form.accessCodeHash) throw new Error("Invalid access code.");
  return true;
}

export async function createEmailVerificationChallenge(input: {
  form: PowerFormRecord;
  email: string;
  submissionId?: string | null;
}) {
  const email = input.email.trim().toLowerCase();
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email.");
  const otp = String(crypto.randomInt(100000, 999999));
  const now = new Date().toISOString();
  const challenge: PowerFormAccessChallengeRecord = {
    schemaVersion: POWERFORM_SCHEMA_VERSION,
    id: crypto.randomUUID(),
    powerFormId: input.form.id,
    officeId: input.form.officeId,
    kind: "email_otp",
    secretHash: hashToken(otp),
    email,
    submissionId: input.submissionId || null,
    attemptCount: 0,
    lockedUntil: null,
    expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString(),
    verifiedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const repos = getPowerFormRepositories();
  await repos.access.create(challenge);
  await sendPowerFormVerificationEmail({
    to: email,
    formName: input.form.name,
    code: otp,
  });
  return { challengeId: challenge.id, expiresAt: challenge.expiresAt };
}

export async function verifyEmailChallenge(input: {
  challengeId: string;
  code: string;
  powerFormId: string;
}) {
  const repos = getPowerFormRepositories();
  const challenge = await repos.access.getById(input.challengeId);
  if (!challenge || challenge.powerFormId !== input.powerFormId || challenge.kind !== "email_otp") {
    throw new Error("Verification challenge not found.");
  }
  assertNotLocked(challenge);
  if (challenge.verifiedAt) return challenge;
  if (new Date(challenge.expiresAt).getTime() < Date.now()) {
    throw new Error("Verification code expired. Request a new one.");
  }
  if (hashToken(String(input.code || "").trim()) !== challenge.secretHash) {
    await bumpFailure(challenge);
  }
  const verified: PowerFormAccessChallengeRecord = {
    ...challenge,
    verifiedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await repos.access.update(verified);
  return verified;
}

export function assertAccessTypeSupported(form: PowerFormRecord) {
  if (form.accessType === "authenticated" || form.accessType === "office_only" || form.accessType === "invitation_only") {
    throw new Error(`Access type "${form.accessType}" is not available in this release.`);
  }
}
