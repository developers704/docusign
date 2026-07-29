import type { TemplateRecord } from "@/lib/types";

const SIGNING_FIELD_TYPES = new Set([
  "signature",
  "initials",
  "witness_signature",
  "manager_signature",
  "hr_signature",
  "notary_signature",
  "office_admin_signature",
]);

/** PowerForm / Web Form require at least one signature or initial field on the template. */
export function templateHasSigningFields(template: { fields?: Array<{ type: string }> | null }) {
  return (template.fields || []).some((field) => SIGNING_FIELD_TYPES.has(field.type));
}

export function assertTemplateReadyForPublishedForm(template: Pick<TemplateRecord, "fields">) {
  if (!templateHasSigningFields(template)) {
    throw new Error(
      "Add Signature or Initial fields on this template first (Edit template → place fields), then create the form."
    );
  }
}
