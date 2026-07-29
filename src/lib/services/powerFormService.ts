import crypto from "node:crypto";
import { getPowerFormRepositories } from "@/lib/repositories/jsonPowerFormRepositories";
import { POWERFORM_SCHEMA_VERSION, normalizePowerFormRecord, slugifyPowerFormName } from "@/lib/powerFormNormalize";
import {
  assertTemplateEligibleForPowerForm,
  assertUniquePowerFormSlug,
  suggestUniqueSlug,
  validatePowerFormConfig,
} from "@/lib/services/powerFormValidationService";
import { hashToken } from "@/lib/store";
import type { PowerFormRecord, TemplateRecord } from "@/lib/types";
import { createTemplateService } from "@/lib/services/templateService";

export type PowerFormActor = { userId: string; email: string };

export type CreatePowerFormInput = {
  template: TemplateRecord;
  name?: string;
  slug?: string;
  description?: string;
  accessType?: PowerFormRecord["accessType"];
  accessCode?: string;
  recipientMode?: PowerFormRecord["recipientMode"];
  collectName?: boolean;
  collectEmail?: boolean;
  collectPhone?: boolean;
  collectEmployeeId?: boolean;
  collectCustomerId?: boolean;
  collectVendorId?: boolean;
  collectOffice?: boolean;
  collectDepartment?: boolean;
  customIntakeFields?: PowerFormRecord["customIntakeFields"];
  defaultRecipientMappings?: PowerFormRecord["defaultRecipientMappings"];
  defaultFieldValues?: Record<string, string>;
  requireConsent?: boolean;
  consentText?: string;
  successMessage?: string;
  redirectUrl?: string | null;
  submissionLimit?: number | null;
  availableFrom?: string | null;
  availableUntil?: string | null;
  allowMultipleSubmissions?: boolean;
  publish?: boolean;
  actor: PowerFormActor;
};

function applyAccessCode(form: PowerFormRecord, accessCode?: string) {
  if (accessCode && accessCode.trim()) {
    form.accessCodeHash = hashToken(accessCode.trim());
    form.requireAccessCode = true;
    if (form.accessType === "public") form.accessType = "access_code";
  }
}

export async function createPowerForm(input: CreatePowerFormInput) {
  assertTemplateEligibleForPowerForm(input.template);
  const repos = getPowerFormRepositories();
  const now = new Date().toISOString();
  const name = (input.name || input.template.name || input.template.title || "PowerForm").trim();
  const slug = input.slug?.trim()
    ? slugifyPowerFormName(input.slug)
    : await suggestUniqueSlug(name);
  await assertUniquePowerFormSlug(slug);

  const form = normalizePowerFormRecord({
    schemaVersion: POWERFORM_SCHEMA_VERSION,
    id: crypto.randomUUID(),
    officeId: input.template.officeId,
    createdByUserId: input.actor.userId,
    createdByEmail: input.actor.email,
    templateId: input.template.id,
    templateVersionId: input.template.currentVersionId || null,
    name,
    slug,
    description: input.description || "",
    status: input.publish ? "published" : "draft",
    accessType: input.accessType || "public",
    recipientMode: input.recipientMode || "self_signer",
    workflowType: "sequential",
    successMessage: input.successMessage || "Thank you. Opening your document to sign…",
    redirectUrl: input.redirectUrl ?? null,
    allowMultipleSubmissions: input.allowMultipleSubmissions ?? true,
    requireEmailVerification: (input.accessType || "public") === "email_verified",
    requireAccessCode: (input.accessType || "public") === "access_code",
    accessCodeHash: null,
    requireConsent: input.requireConsent ?? false,
    consentText: input.consentText || "I agree to use electronic records and signatures.",
    collectName: input.collectName ?? true,
    collectEmail: input.collectEmail ?? true,
    collectPhone: input.collectPhone ?? false,
    collectEmployeeId: input.collectEmployeeId ?? false,
    collectCustomerId: input.collectCustomerId ?? false,
    collectVendorId: input.collectVendorId ?? false,
    collectOffice: input.collectOffice ?? false,
    collectDepartment: input.collectDepartment ?? false,
    customIntakeFields: input.customIntakeFields || [],
    defaultRecipientMappings: input.defaultRecipientMappings || [],
    defaultFieldValues: input.defaultFieldValues || {},
    submissionLimit: input.submissionLimit ?? null,
    submissionCount: 0,
    availableFrom: input.availableFrom ?? null,
    availableUntil: input.availableUntil ?? null,
    createdAt: now,
    updatedAt: now,
    publishedAt: input.publish ? now : null,
    archivedAt: null,
    lastSubmissionAt: null,
  });

  applyAccessCode(form, input.accessCode);
  validatePowerFormConfig(form);
  if (input.publish) validatePowerFormConfig(form);
  return repos.forms.create(form);
}

export async function updatePowerForm(
  id: string,
  patch: Partial<PowerFormRecord> & { accessCode?: string },
  actor: PowerFormActor
) {
  const repos = getPowerFormRepositories();
  const existing = await repos.forms.getById(id);
  if (!existing) throw new Error("PowerForm not found.");

  const { accessCode, ...rest } = patch;
  const next = normalizePowerFormRecord({
    ...existing,
    ...rest,
    id: existing.id,
    officeId: existing.officeId,
    createdByUserId: existing.createdByUserId || actor.userId,
    createdByEmail: existing.createdByEmail || actor.email,
    updatedAt: new Date().toISOString(),
  });

  if (rest.slug && rest.slug !== existing.slug) {
    next.slug = slugifyPowerFormName(rest.slug);
    await assertUniquePowerFormSlug(next.slug, existing.id);
  }
  if (typeof accessCode === "string" && accessCode.trim()) {
    applyAccessCode(next, accessCode);
  }
  if (next.accessType === "access_code") next.requireAccessCode = true;
  if (next.accessType === "email_verified") next.requireEmailVerification = true;
  validatePowerFormConfig(next);
  return repos.forms.update(next);
}

export async function setPowerFormStatus(
  id: string,
  status: PowerFormRecord["status"],
  actor: PowerFormActor
) {
  const repos = getPowerFormRepositories();
  const existing = await repos.forms.getById(id);
  if (!existing) throw new Error("PowerForm not found.");
  const now = new Date().toISOString();
  const next = normalizePowerFormRecord({
    ...existing,
    status,
    updatedAt: now,
    publishedAt: status === "published" ? existing.publishedAt || now : existing.publishedAt,
    archivedAt: status === "archived" ? now : status === "published" || status === "paused" || status === "draft" ? null : existing.archivedAt,
  });
  if (status === "published") validatePowerFormConfig(next);
  void actor;
  return repos.forms.update(next);
}

export async function upgradePowerFormTemplateVersion(id: string, template: TemplateRecord) {
  assertTemplateEligibleForPowerForm(template);
  const repos = getPowerFormRepositories();
  const existing = await repos.forms.getById(id);
  if (!existing) throw new Error("PowerForm not found.");
  if (existing.templateId !== template.id) throw new Error("Template mismatch for this PowerForm.");
  const versionId = template.currentVersionId;
  if (!versionId) throw new Error("Template has no current version to upgrade to.");
  return repos.forms.update(
    normalizePowerFormRecord({
      ...existing,
      templateVersionId: versionId,
      updatedAt: new Date().toISOString(),
    })
  );
}

export async function listPowerForms(filter?: { officeId?: string | null; templateId?: string }) {
  return getPowerFormRepositories().forms.list(filter);
}

export async function getPowerFormById(id: string) {
  return getPowerFormRepositories().forms.getById(id);
}

export async function getPowerFormBySlug(slug: string) {
  return getPowerFormRepositories().forms.getBySlug(slug);
}

/** Quick create used by template menu — draft published with defaults. */
export async function createPowerFormFromTemplateQuick(input: {
  templateId: string;
  name?: string;
  actor: PowerFormActor;
  publish?: boolean;
}) {
  const templateService = createTemplateService();
  const template = await templateService.getById(input.templateId);
  if (!template) throw new Error("Template not found.");
  return createPowerForm({
    template,
    name: input.name,
    actor: input.actor,
    publish: input.publish ?? true,
  });
}
