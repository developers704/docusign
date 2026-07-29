import { templateHasSigningFields } from "@/lib/templateSigningFields";
import { isPowerFormPubliclyAvailable, slugifyPowerFormName } from "@/lib/powerFormNormalize";
import type { PowerFormRecord, TemplateRecord } from "@/lib/types";
import { getPowerFormRepositories } from "@/lib/repositories/jsonPowerFormRepositories";

const SUPPORTED_ACCESS = new Set(["public", "access_code", "email_verified"]);
const SUPPORTED_RECIPIENT_MODES = new Set(["self_signer", "self_signer_plus_internal", "fixed_recipients"]);

export function assertTemplateEligibleForPowerForm(template: TemplateRecord) {
  if (template.status !== "published") {
    throw new Error("Only published templates can be used for PowerForms.");
  }
  if (!templateHasSigningFields(template)) {
    throw new Error("Add Signature or Initial fields on this template first, then create the PowerForm.");
  }
}

export async function assertUniquePowerFormSlug(slug: string, excludeId?: string) {
  const repos = getPowerFormRepositories();
  const existing = await repos.forms.getBySlug(slug);
  if (existing && existing.id !== excludeId) {
    throw new Error("That slug is already in use. Choose another.");
  }
}

export function validatePowerFormConfig(form: PowerFormRecord) {
  if (!form.name.trim()) throw new Error("PowerForm name is required.");
  if (!form.slug.trim()) throw new Error("PowerForm slug is required.");
  if (!SUPPORTED_ACCESS.has(form.accessType)) {
    throw new Error(`Access type "${form.accessType}" is not available yet. Use public, access_code, or email_verified.`);
  }
  if (!SUPPORTED_RECIPIENT_MODES.has(form.recipientMode)) {
    throw new Error(
      `Recipient mode "${form.recipientMode}" is not available yet. Use self_signer, self_signer_plus_internal, or fixed_recipients.`
    );
  }
  if ((form.accessType === "access_code" || form.requireAccessCode) && !form.accessCodeHash) {
    throw new Error("Set an access code before publishing an access-code PowerForm.");
  }
  if (!form.collectName && !form.collectEmail && form.customIntakeFields.length === 0) {
    throw new Error("Collect at least a name, email, or one custom field.");
  }
  if (form.collectEmail === false && form.accessType === "email_verified") {
    throw new Error("Email verification requires collecting email.");
  }
}

export function validateIntakeValues(
  form: PowerFormRecord,
  intake: Record<string, string>,
  options?: { consentAccepted?: boolean }
) {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(intake)) {
    values[key] = String(value || "").trim();
  }

  if (form.collectName && !values.name) throw new Error("Full name is required.");
  if (form.collectEmail) {
    if (!values.email) throw new Error("Email is required.");
    if (!/^\S+@\S+\.\S+$/.test(values.email)) throw new Error("Enter a valid email.");
    values.email = values.email.toLowerCase();
  }
  if (form.collectPhone && !values.phone) throw new Error("Phone is required.");
  if (form.collectEmployeeId && !values.employeeId) throw new Error("Employee ID is required.");
  if (form.collectCustomerId && !values.customerId) throw new Error("Customer ID is required.");
  if (form.collectVendorId && !values.vendorId) throw new Error("Vendor ID is required.");
  if (form.collectOffice && !values.office) throw new Error("Office is required.");
  if (form.collectDepartment && !values.department) throw new Error("Department is required.");

  for (const field of form.customIntakeFields) {
    const value = values[field.key] || "";
    if (field.required && !value) throw new Error(`${field.label} is required.`);
    if (field.type === "email" && value && !/^\S+@\S+\.\S+$/.test(value)) {
      throw new Error(`${field.label} must be a valid email.`);
    }
  }

  if (form.requireConsent && !options?.consentAccepted) {
    throw new Error("Consent is required to continue.");
  }

  return values;
}

export function assertPowerFormAcceptingSubmissions(form: PowerFormRecord) {
  if (!isPowerFormPubliclyAvailable(form)) {
    if (form.status === "draft") throw new Error("This PowerForm is not published yet.");
    if (form.status === "paused") throw new Error("This PowerForm is paused.");
    if (form.status === "archived") throw new Error("This PowerForm is archived.");
    if (form.submissionLimit !== null && form.submissionCount >= form.submissionLimit) {
      throw new Error("This PowerForm has reached its submission limit.");
    }
    throw new Error("This PowerForm is not available right now.");
  }
}

export async function suggestUniqueSlug(base: string, excludeId?: string) {
  const repos = getPowerFormRepositories();
  const all = await repos.forms.list();
  let slug = slugifyPowerFormName(base);
  let attempt = 1;
  while (all.some((form) => form.slug === slug && form.id !== excludeId)) {
    attempt += 1;
    slug = `${slugifyPowerFormName(base)}-${attempt}`;
  }
  return slug;
}
