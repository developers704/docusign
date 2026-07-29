import type {
  TemplateDocumentRecord,
  TemplateFieldRecord,
  TemplatePageAssignmentRecord,
  TemplateRecipientRoleRecord,
  TemplateRecord,
} from "@/lib/types";

export type ValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

function requireNonEmpty(value: string, message: string, errors: string[]) {
  if (!value.trim()) errors.push(message);
}

export function validateTemplateForSave(input: Partial<TemplateRecord>) {
  const errors: string[] = [];
  const warnings: string[] = [];
  requireNonEmpty(String(input.name || ""), "Template name is required.", errors);
  requireNonEmpty(String(input.officeId || ""), "Template office is required.", errors);
  if ((input.visibility || "office") === "global" && input.ownerUserId === null) {
    warnings.push("Global template ownership should map to a super admin user.");
  }
  return { ok: errors.length === 0, errors, warnings } satisfies ValidationResult;
}

export function validateTemplateForPublish(input: {
  template: TemplateRecord;
  roles: TemplateRecipientRoleRecord[];
  fields: TemplateFieldRecord[];
  pageAssignments: TemplatePageAssignmentRecord[];
  documents: TemplateDocumentRecord[];
}) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { template, roles, fields, pageAssignments, documents } = input;
  requireNonEmpty(template.name, "Template name is required.", errors);
  requireNonEmpty(template.officeId, "Template office is required.", errors);
  if (template.visibility === "global" && !template.ownerUserId) {
    errors.push("Global templates require super-admin ownership.");
  }
  if (!roles.length) errors.push("At least one recipient role is required before publishing.");

  const roleIds = new Set(roles.map((role) => role.id));
  const roleNameSet = new Set<string>();
  for (const role of roles) {
    const key = role.roleName.trim().toLowerCase();
    if (!key) errors.push("Recipient role name is required.");
    if (roleNameSet.has(key)) errors.push(`Duplicate recipient role name: ${role.roleName}`);
    roleNameSet.add(key);
  }

  for (const field of fields) {
    if (!field.recipientRoleId) errors.push(`Field "${field.label}" is missing an assigned role.`);
    if (field.recipientRoleId && !roleIds.has(field.recipientRoleId)) {
      errors.push(`Field "${field.label}" references a missing role.`);
    }
  }
  for (const assignment of pageAssignments) {
    for (const roleId of assignment.assignedRoleIds) {
      if (!roleIds.has(roleId)) errors.push(`Page ${assignment.pageNumber} references a missing role.`);
    }
  }

  if (!documents.length) warnings.push("No template PDF is attached yet.");
  for (const document of documents) {
    if (!document.filePath || !document.storedFileName || !document.sha256) {
      errors.push(`Template document metadata is invalid for ${document.originalFileName || "document"}.`);
    }
  }

  for (const role of roles) {
    const hasRoleField = fields.some((field) => field.recipientRoleId === role.id);
    const hasRolePage = pageAssignments.some((assignment) => assignment.assignedRoleIds.includes(role.id));
    if (!hasRoleField || !hasRolePage) {
      warnings.push(`Role "${role.roleName}" has incomplete assignments (fields/pages).`);
    }
  }
  const unassignedPages = pageAssignments.filter((assignment) => assignment.assignedRoleIds.length === 0);
  if (unassignedPages.length) {
    warnings.push(`${unassignedPages.length} page assignments have no assigned roles.`);
  }

  return { ok: errors.length === 0, errors, warnings } satisfies ValidationResult;
}

