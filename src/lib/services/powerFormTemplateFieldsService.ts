import crypto from "node:crypto";
import type { DocumentFieldType, TemplateFieldRecord, TemplateRecord } from "@/lib/types";
import { createTemplateService } from "@/lib/services/templateService";
import { templateHasSigningFields } from "@/lib/templateSigningFields";

export type PlacedTemplateFieldInput = {
  type: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  required?: boolean;
};

function buildField(input: {
  template: TemplateRecord;
  versionId: string;
  placed: PlacedTemplateFieldInput;
  roleId: string | null;
}): TemplateFieldRecord {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const type = input.placed.type as DocumentFieldType;
  const label = input.placed.label || type;
  return {
    id,
    type,
    templateId: input.template.id,
    versionId: input.versionId,
    documentId: input.template.documents?.[0]?.id || null,
    page: Math.max(1, Math.round(input.placed.page || 1)),
    x: Number(input.placed.x) || 0,
    y: Number(input.placed.y) || 0,
    width: Number(input.placed.width) || 20,
    height: Number(input.placed.height) || 5,
    recipientRoleId: input.roleId,
    required: input.placed.required !== false,
    readOnly: false,
    hidden: false,
    locked: false,
    label,
    fieldName: label,
    internalKey: id,
    placeholder: "",
    helpText: "",
    tooltip: label,
    defaultValue: "",
    validationRule: "",
    minimumLength: null,
    maximumLength: null,
    minimumValue: null,
    maximumValue: null,
    regexPattern: "",
    tabOrder: null,
    fontSize: null,
    alignment: "left",
    conditionalVisibility: "",
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Replaces/appends user-placed fields onto the template (same % coordinates as agreement Prepare).
 */
export async function addFieldsToTemplateForPowerForm(input: {
  templateId: string;
  placedFields: PlacedTemplateFieldInput[];
  /** When true, replace all template fields with placedFields. When false, append. */
  replaceExisting?: boolean;
}) {
  const placed = input.placedFields || [];
  if (!placed.length) throw new Error("Place at least one field on the document.");
  const hasSigning = placed.some((field) => field.type === "signature" || field.type === "initials");
  if (!hasSigning) {
    throw new Error("Place a Signature or Initials field where the signer should sign.");
  }

  const service = createTemplateService();
  const template = await service.getById(input.templateId);
  if (!template) throw new Error("Template not found.");
  const versionId = template.currentVersionId;
  if (!versionId) throw new Error("Template has no version.");

  const roleId = template.recipientRoles?.[0]?.id || null;
  const created = placed.map((item) =>
    buildField({
      template,
      versionId,
      placed: item,
      roleId,
    })
  );

  const nextFields = input.replaceExisting ? created : [...(template.fields || []), ...created];
  await service.fieldService.replace(versionId, nextFields);
  const refreshed = await service.getById(template.id);
  if (!refreshed) throw new Error("Template update failed.");
  if (!templateHasSigningFields(refreshed)) {
    throw new Error("Signature/Initial fields were not saved. Try placing them again.");
  }
  return refreshed;
}
