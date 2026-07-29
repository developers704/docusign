import type {
  PowerFormAccessChallengeRecord,
  PowerFormAccessType,
  PowerFormAnalyticsSnapshot,
  PowerFormCustomIntakeField,
  PowerFormRecipientMapping,
  PowerFormRecipientMode,
  PowerFormRecord,
  PowerFormStatus,
  PowerFormSubmissionRecord,
  PowerFormSubmissionStatus,
} from "@/lib/types";

export const POWERFORM_SCHEMA_VERSION = 1;

const ACCESS_TYPES = new Set<PowerFormAccessType>([
  "public",
  "access_code",
  "email_verified",
  "authenticated",
  "office_only",
  "invitation_only",
]);

const RECIPIENT_MODES = new Set<PowerFormRecipientMode>([
  "self_signer",
  "self_signer_plus_internal",
  "multiple_public_recipients",
  "fixed_recipients",
  "mixed",
]);

const STATUSES = new Set<PowerFormStatus>(["draft", "published", "paused", "archived"]);

const SUBMISSION_STATUSES = new Set<PowerFormSubmissionStatus>([
  "started",
  "awaiting_verification",
  "verified",
  "envelope_created",
  "signing",
  "completed",
  "cancelled",
  "blocked",
  "failed",
]);

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asBool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  return null;
}

function asNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeStatus(raw: unknown): PowerFormStatus {
  if (raw === "active") return "published";
  if (raw === "disabled") return "paused";
  if (typeof raw === "string" && STATUSES.has(raw as PowerFormStatus)) return raw as PowerFormStatus;
  return "draft";
}

function normalizeAccessType(raw: unknown, requireAccessCode: boolean, requireEmailVerification: boolean): PowerFormAccessType {
  if (typeof raw === "string" && ACCESS_TYPES.has(raw as PowerFormAccessType)) return raw as PowerFormAccessType;
  if (requireAccessCode) return "access_code";
  if (requireEmailVerification) return "email_verified";
  return "public";
}

function normalizeRecipientMode(raw: unknown): PowerFormRecipientMode {
  if (typeof raw === "string" && RECIPIENT_MODES.has(raw as PowerFormRecipientMode)) {
    return raw as PowerFormRecipientMode;
  }
  return "self_signer";
}

function normalizeCustomFields(raw: unknown): PowerFormCustomIntakeField[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      const row = item as Partial<PowerFormCustomIntakeField>;
      const key = asString(row.key, `custom_${index + 1}`).trim() || `custom_${index + 1}`;
      const type = (["text", "email", "phone", "number", "textarea"] as const).includes(
        row.type as PowerFormCustomIntakeField["type"]
      )
        ? (row.type as PowerFormCustomIntakeField["type"])
        : "text";
      return {
        id: asString(row.id, crypto.randomUUID()),
        key,
        label: asString(row.label, key),
        type,
        required: asBool(row.required, false),
      };
    })
    .filter((item) => item.key);
}

function normalizeMappings(raw: unknown): PowerFormRecipientMapping[] {
  if (!Array.isArray(raw)) return [];
  const out: PowerFormRecipientMapping[] = [];
  for (const item of raw) {
    const row = item as Partial<PowerFormRecipientMapping>;
    const templateRoleId = asString(row.templateRoleId);
    if (!templateRoleId) continue;
    out.push({
      templateRoleId,
      source: row.source === "fixed" ? "fixed" : "intake",
      nameFrom: asNullableString(row.nameFrom) || undefined,
      emailFrom: asNullableString(row.emailFrom) || undefined,
      fixedName: asNullableString(row.fixedName) || undefined,
      fixedEmail: asNullableString(row.fixedEmail) || undefined,
    });
  }
  return out;
}

function normalizeDefaultFieldValues(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

/** Normalize legacy and new PowerForm payloads into the current schema. */
export function normalizePowerFormRecord(raw: unknown): PowerFormRecord {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const requireAccessCode = asBool(row.requireAccessCode, Boolean(row.accessCodeHash));
  const requireEmailVerification = asBool(row.requireEmailVerification, false);
  const submissionCount =
    typeof row.submissionCount === "number"
      ? row.submissionCount
      : typeof row.usageCount === "number"
        ? row.usageCount
        : 0;
  const accessType = normalizeAccessType(row.accessType, requireAccessCode, requireEmailVerification);

  return {
    schemaVersion: typeof row.schemaVersion === "number" ? row.schemaVersion : POWERFORM_SCHEMA_VERSION,
    id: asString(row.id) || crypto.randomUUID(),
    officeId: asString(row.officeId),
    createdByUserId: asNullableString(row.createdByUserId),
    createdByEmail: asString(row.createdByEmail),
    templateId: asString(row.templateId),
    templateVersionId: asNullableString(row.templateVersionId),
    name: asString(row.name, "PowerForm"),
    slug: asString(row.slug),
    description: asString(row.description),
    status: normalizeStatus(row.status),
    accessType,
    recipientMode: normalizeRecipientMode(row.recipientMode),
    workflowType:
      row.workflowType === "parallel" || row.workflowType === "grouped" ? row.workflowType : "sequential",
    successMessage: asString(row.successMessage, "Thank you. Your document is ready to sign."),
    redirectUrl: asNullableString(row.redirectUrl),
    allowMultipleSubmissions: asBool(row.allowMultipleSubmissions, true),
    requireEmailVerification: requireEmailVerification || accessType === "email_verified",
    requireAccessCode: requireAccessCode || accessType === "access_code",
    accessCodeHash: asNullableString(row.accessCodeHash),
    requireConsent: asBool(row.requireConsent, false),
    consentText: asString(row.consentText, "I agree to use electronic records and signatures."),
    collectName: asBool(row.collectName, true),
    collectEmail: asBool(row.collectEmail, true),
    collectPhone: asBool(row.collectPhone, false),
    collectEmployeeId: asBool(row.collectEmployeeId, false),
    collectCustomerId: asBool(row.collectCustomerId, false),
    collectVendorId: asBool(row.collectVendorId, false),
    collectOffice: asBool(row.collectOffice, false),
    collectDepartment: asBool(row.collectDepartment, false),
    customIntakeFields: normalizeCustomFields(row.customIntakeFields),
    defaultRecipientMappings: normalizeMappings(row.defaultRecipientMappings),
    defaultFieldValues: normalizeDefaultFieldValues(row.defaultFieldValues),
    submissionLimit: asNumberOrNull(row.submissionLimit),
    submissionCount,
    usageCount: submissionCount,
    availableFrom: asNullableString(row.availableFrom),
    availableUntil: asNullableString(row.availableUntil),
    createdAt: asString(row.createdAt, new Date().toISOString()),
    updatedAt: asString(row.updatedAt, new Date().toISOString()),
    publishedAt: asNullableString(row.publishedAt),
    archivedAt: asNullableString(row.archivedAt),
    lastSubmissionAt: asNullableString(row.lastSubmissionAt),
  };
}

export function normalizePowerFormSubmission(raw: unknown): PowerFormSubmissionRecord {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const status =
    typeof row.status === "string" && SUBMISSION_STATUSES.has(row.status as PowerFormSubmissionStatus)
      ? (row.status as PowerFormSubmissionStatus)
      : "started";
  const intakeValues =
    row.intakeValues && typeof row.intakeValues === "object" && !Array.isArray(row.intakeValues)
      ? Object.fromEntries(
          Object.entries(row.intakeValues as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string"
          )
        )
      : {};
  const now = new Date().toISOString();
  return {
    schemaVersion: typeof row.schemaVersion === "number" ? row.schemaVersion : POWERFORM_SCHEMA_VERSION,
    id: asString(row.id) || crypto.randomUUID(),
    powerFormId: asString(row.powerFormId),
    officeId: asString(row.officeId),
    envelopeId: asNullableString(row.envelopeId),
    submittedByName: asString(row.submittedByName),
    submittedByEmail: asString(row.submittedByEmail).toLowerCase(),
    submittedByPhone: asNullableString(row.submittedByPhone),
    intakeValues,
    status,
    startedAt: asString(row.startedAt, now),
    verifiedAt: asNullableString(row.verifiedAt),
    envelopeCreatedAt: asNullableString(row.envelopeCreatedAt),
    completedAt: asNullableString(row.completedAt),
    cancelledAt: asNullableString(row.cancelledAt),
    ipAddress: asNullableString(row.ipAddress),
    userAgent: asNullableString(row.userAgent),
    consentAcceptedAt: asNullableString(row.consentAcceptedAt),
    consentTextVersion: asNullableString(row.consentTextVersion),
    verificationAttemptCount: typeof row.verificationAttemptCount === "number" ? row.verificationAttemptCount : 0,
    verificationLockedUntil: asNullableString(row.verificationLockedUntil),
    createdAt: asString(row.createdAt, now),
    updatedAt: asString(row.updatedAt, now),
  };
}

export function normalizePowerFormAccessChallenge(raw: unknown): PowerFormAccessChallengeRecord {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kind =
    row.kind === "email_otp" || row.kind === "invitation" || row.kind === "access_code"
      ? row.kind
      : "access_code";
  const now = new Date().toISOString();
  return {
    schemaVersion: typeof row.schemaVersion === "number" ? row.schemaVersion : POWERFORM_SCHEMA_VERSION,
    id: asString(row.id) || crypto.randomUUID(),
    powerFormId: asString(row.powerFormId),
    officeId: asString(row.officeId),
    kind,
    secretHash: asString(row.secretHash),
    email: asNullableString(row.email),
    submissionId: asNullableString(row.submissionId),
    attemptCount: typeof row.attemptCount === "number" ? row.attemptCount : 0,
    lockedUntil: asNullableString(row.lockedUntil),
    expiresAt: asString(row.expiresAt, now),
    verifiedAt: asNullableString(row.verifiedAt),
    createdAt: asString(row.createdAt, now),
    updatedAt: asString(row.updatedAt, now),
  };
}

export function normalizePowerFormAnalytics(raw: unknown): PowerFormAnalyticsSnapshot {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    schemaVersion: typeof row.schemaVersion === "number" ? row.schemaVersion : POWERFORM_SCHEMA_VERSION,
    powerFormId: asString(row.powerFormId),
    officeId: asString(row.officeId),
    totalSubmissions: typeof row.totalSubmissions === "number" ? row.totalSubmissions : 0,
    completedSubmissions: typeof row.completedSubmissions === "number" ? row.completedSubmissions : 0,
    failedSubmissions: typeof row.failedSubmissions === "number" ? row.failedSubmissions : 0,
    signingSubmissions: typeof row.signingSubmissions === "number" ? row.signingSubmissions : 0,
    lastSubmissionAt: asNullableString(row.lastSubmissionAt),
    updatedAt: asString(row.updatedAt, new Date().toISOString()),
  };
}

export function isPowerFormPubliclyAvailable(form: PowerFormRecord, now = new Date()) {
  if (form.status !== "published") return false;
  if (form.availableFrom && new Date(form.availableFrom).getTime() > now.getTime()) return false;
  if (form.availableUntil && new Date(form.availableUntil).getTime() < now.getTime()) return false;
  if (form.submissionLimit !== null && form.submissionCount >= form.submissionLimit) return false;
  return true;
}

export function slugifyPowerFormName(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "form"
  );
}
