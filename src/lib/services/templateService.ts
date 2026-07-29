import crypto from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { addAuditEvent } from "@/lib/store";
import { createJsonTemplateRepositories, TEMPLATE_SCHEMA_VERSION } from "@/lib/repositories/jsonTemplateRepositories";
import type { TemplateListFilter, TemplateRepositories } from "@/lib/repositories/templateRepositories";
import type {
  AuditEventType,
  TemplatePageAssignmentRecord,
  TemplateRecipientRoleRecord,
  TemplateRecord,
  TemplateRoleType,
  TemplateVersionRecord,
} from "@/lib/types";
import { TemplateDocumentService } from "./templateDocumentService";
import { TemplateFieldService } from "./templateFieldService";
import { TemplatePageAssignmentService } from "./templatePageAssignmentService";
import { validateTemplateForPublish, validateTemplateForSave } from "./templateValidationService";
import { TemplateVersionService } from "./templateVersionService";

const MAX_TEMPLATE_ROLES = Number(process.env.MAX_TEMPLATE_ROLES_PER_TEMPLATE || "100");

function nowIso() {
  return new Date().toISOString();
}

function roleTypeFromAction(action?: string): TemplateRoleType | null {
  if (!action) return null;
  if (action === "needs_to_approve") return "approver";
  if (action === "receives_a_copy") return "receives_copy";
  if (action === "needs_to_view") return "view_only";
  if (action === "needs_to_sign" || action === "in_person_signer") return "signer";
  return null;
}

function roleTypeFromName(name: string): TemplateRoleType {
  const lower = name.toLowerCase();
  if (lower.includes("approve")) return "approver";
  if (lower.includes("review")) return "reviewer";
  if (lower.includes("witness")) return "witness";
  if (lower.includes("copy")) return "receives_copy";
  return "signer";
}

export type TemplateRoleDraft = {
  roleName: string;
  defaultName?: string;
  defaultEmail?: string;
  action?: string;
};

function buildRolesFromDrafts(
  templateId: string,
  versionId: string,
  drafts: TemplateRoleDraft[],
  now: string,
  existingRoles: TemplateRecipientRoleRecord[] = []
): TemplateRecipientRoleRecord[] {
  const usedNames = new Set<string>();
  const roles: TemplateRecipientRoleRecord[] = [];
  for (let index = 0; index < drafts.length; index += 1) {
    const draft = drafts[index];
    let roleName = (draft.roleName || `Signer ${index + 1}`).trim() || `Signer ${index + 1}`;
    const baseKey = roleName.toLowerCase();
    if (usedNames.has(baseKey)) {
      let n = 2;
      while (usedNames.has(`${baseKey} ${n}`)) n += 1;
      roleName = `${roleName} ${n}`;
    }
    usedNames.add(roleName.toLowerCase());
    const existing = existingRoles[index];
    const roleType = roleTypeFromAction(draft.action) || roleTypeFromName(roleName);
    const defaultName = String(draft.defaultName || "").trim();
    const defaultEmail = String(draft.defaultEmail || "").trim().toLowerCase();
    if (existing) {
      roles.push({
        ...existing,
        roleName,
        roleType,
        signingOrder: index + 1,
        signingStep: index + 1,
        defaultName: defaultName || undefined,
        defaultEmail: defaultEmail || undefined,
        updatedAt: now,
      });
    } else {
      roles.push({
        ...baseRole(templateId, versionId, roleName, index + 1, now),
        roleType,
        defaultName: defaultName || undefined,
        defaultEmail: defaultEmail || undefined,
      });
    }
  }
  return roles.length ? roles : [baseRole(templateId, versionId, "Signer", 1, now)];
}

function baseRole(
  templateId: string,
  versionId: string,
  roleName: string,
  order: number,
  now: string
): TemplateRecipientRoleRecord {
  return {
    id: crypto.randomUUID(),
    templateId,
    versionId,
    roleName,
    roleType: roleTypeFromName(roleName),
    signingOrder: order,
    signingStep: order,
    isRequired: true,
    canEditFields: true,
    canViewAllPages: false,
    createdAt: now,
    updatedAt: now,
  };
}

export class TemplateService {
  readonly versionService: TemplateVersionService;
  readonly documentService: TemplateDocumentService;
  readonly fieldService: TemplateFieldService;
  readonly pageAssignmentService: TemplatePageAssignmentService;

  constructor(private readonly repos: TemplateRepositories = createJsonTemplateRepositories()) {
    this.versionService = new TemplateVersionService(repos.versions);
    this.documentService = new TemplateDocumentService(repos.documents);
    this.fieldService = new TemplateFieldService(repos.fields);
    this.pageAssignmentService = new TemplatePageAssignmentService(repos.pageAssignments);
  }

  async list(filter?: TemplateListFilter) {
    return this.repos.templates.list(filter);
  }

  async listAvailableForEnvelopeCreation(officeId?: string) {
    const items = await this.repos.templates.list({ officeId, includeGlobal: true });
    // Draft templates are usable when creating agreements (uploaded docs carry over).
    return items.filter((template) => template.status === "published" || template.status === "draft");
  }

  async getById(templateId: string) {
    return this.repos.templates.getById(templateId);
  }

  async createTemplate(input: {
    actor: { userId: string; email: string; role: string };
    officeId: string;
    name: string;
    title: string;
    description: string;
    message: string;
    content: string;
    category: string;
    tags: string[];
    visibility: TemplateRecord["visibility"];
    selectedOfficeIds: string[];
    selectedGroupIds: string[];
    roleNames: string[];
    roleDrafts?: TemplateRoleDraft[];
    sourceType: TemplateRecord["sourceType"];
    expiryDays: number;
    internalNotes: string;
  }) {
    if (input.visibility === "global" && input.actor.role !== "super_admin") {
      throw new Error("Only super admins may create global templates.");
    }
    const now = nowIso();
    const templateId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const drafts: TemplateRoleDraft[] =
      input.roleDrafts?.length
        ? input.roleDrafts.slice(0, MAX_TEMPLATE_ROLES)
        : (input.roleNames.length ? input.roleNames : ["Signer"]).map((roleName) => ({ roleName }));
    const roles = buildRolesFromDrafts(templateId, versionId, drafts, now);
    const template: TemplateRecord = {
      schemaVersion: TEMPLATE_SCHEMA_VERSION,
      id: templateId,
      officeId: input.officeId,
      ownerUserId: input.actor.userId,
      name: input.name.trim(),
      title: input.title.trim(),
      description: input.description.trim(),
      message: input.message.trim(),
      content: input.content.trim(),
      sourceType: input.sourceType,
      category: input.category.trim(),
      tags: input.tags,
      status: "draft",
      visibility: input.visibility,
      selectedOfficeIds: input.selectedOfficeIds,
      selectedGroupIds: input.selectedGroupIds,
      publishedAt: null,
      archivedAt: null,
      currentVersionId: versionId,
      usageCount: 0,
      expiryDays: input.expiryDays,
      internalNotes: input.internalNotes.trim(),
      folderIds: [],
      matchingEligible: true,
      recipientRoles: roles,
      fields: [],
      pageAssignments: [],
      documents: [],
      versions: [
        {
          id: versionId,
          templateId,
          versionNumber: 1,
          title: input.title.trim(),
          message: input.message.trim(),
          description: input.description.trim(),
          documentMetadata: [],
          recipientRoles: roles,
          fields: [],
          pageAssignments: [],
          createdByUserId: input.actor.userId,
          createdAt: now,
          changeSummary: "Initial template draft",
          isCurrent: true,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
    const saveValidation = validateTemplateForSave(template);
    if (!saveValidation.ok) throw new Error(saveValidation.errors.join(" "));
    const created = await this.repos.templates.create(template);
    await addAuditEvent({
      officeId: created.officeId,
      envelopeId: created.id,
      recipientId: null,
      type: "template_created",
      message: `Template created: ${created.name}`,
      ipAddress: null,
      userAgent: null,
      metadata: { templateId: created.id, version: 1, status: created.status },
    });
    return created;
  }

  async updateTemplate(input: {
    actor: { userId: string; email: string; role: string };
    template: TemplateRecord;
    name: string;
    title: string;
    description: string;
    message: string;
    content: string;
    category: string;
    tags: string[];
    roleNames: string[];
    roleDrafts?: TemplateRoleDraft[];
    internalNotes: string;
  }) {
    const template = { ...input.template };
    if (template.visibility === "global" && input.actor.role !== "super_admin") {
      throw new Error("Only super admins may edit global templates.");
    }

    const now = nowIso();
    const versionId = template.currentVersionId;
    if (!versionId) throw new Error("Template version not found.");

    const drafts: TemplateRoleDraft[] =
      input.roleDrafts?.length
        ? input.roleDrafts.slice(0, MAX_TEMPLATE_ROLES)
        : (input.roleNames.length ? input.roleNames : ["Signer"]).map((roleName) => ({ roleName }));
    const existingRoles = [...template.recipientRoles].sort((a, b) => a.signingOrder - b.signingOrder);
    const nextRoles = buildRolesFromDrafts(template.id, versionId, drafts, now, existingRoles);
    const keptRoleIds = new Set(nextRoles.map((role) => role.id));

    // Drop fields tied to removed roles
    // (keptRoleIds used below when remapping — continue with existing update body)

    const removedRoleIds = new Set(existingRoles.filter((role) => !keptRoleIds.has(role.id)).map((role) => role.id));
    const nextFields = template.fields.filter((field) => !field.recipientRoleId || !removedRoleIds.has(field.recipientRoleId));
    const nextPageAssignments = template.pageAssignments
      .map((assignment) => ({
        ...assignment,
        assignedRoleIds: assignment.assignedRoleIds.filter((roleId) => !removedRoleIds.has(roleId)),
      }))
      .filter((assignment) => assignment.assignedRoleIds.length > 0);

    template.name = input.name.trim();
    template.title = input.title.trim();
    template.description = input.description.trim();
    template.message = input.message.trim();
    template.content = input.content.trim();
    template.category = input.category.trim();
    template.tags = input.tags;
    template.internalNotes = input.internalNotes.trim();
    template.recipientRoles = nextRoles;
    template.fields = nextFields;
    template.pageAssignments = nextPageAssignments;
    template.updatedAt = now;

    const currentVersion = template.versions.find((version) => version.id === versionId);
    if (currentVersion) {
      currentVersion.title = template.title;
      currentVersion.message = template.message;
      currentVersion.description = template.description;
      currentVersion.recipientRoles = nextRoles;
      currentVersion.fields = nextFields;
      currentVersion.pageAssignments = nextPageAssignments;
      currentVersion.documentMetadata = JSON.parse(JSON.stringify(template.documents || []));
    }

    if (template.status === "published") {
      const validation = validateTemplateForPublish({
        template,
        roles: nextRoles,
        fields: nextFields,
        pageAssignments: nextPageAssignments,
        documents: template.documents,
      });
      if (!validation.ok) template.status = "draft";
    }

    const saveValidation = validateTemplateForSave(template);
    if (!saveValidation.ok) throw new Error(saveValidation.errors.join(" "));

    const updated = await this.repos.templates.update(template);
    await addAuditEvent({
      officeId: updated.officeId,
      envelopeId: updated.id,
      recipientId: null,
      type: "template_updated",
      message: `Template updated: ${updated.name}`,
      ipAddress: null,
      userAgent: null,
      metadata: { templateId: updated.id, updatedBy: input.actor.email },
    });
    return updated;
  }

  async duplicateTemplate(input: {
    actor: { userId: string; email: string };
    template: TemplateRecord;
  }) {
    const source = input.template;
    const now = nowIso();
    const templateId = crypto.randomUUID();
    const newVersionId = crypto.randomUUID();
    const roleIdMapping = new Map<string, string>();
    const roles = source.recipientRoles.map((role) => {
      const id = crypto.randomUUID();
      roleIdMapping.set(role.id, id);
      return {
        ...role,
        id,
        templateId,
        versionId: newVersionId,
        createdAt: now,
        updatedAt: now,
      };
    });
    const duplicate: TemplateRecord = {
      ...source,
      id: templateId,
      ownerUserId: input.actor.userId,
      name: `${source.name} (Copy)`,
      status: "draft",
      publishedAt: null,
      archivedAt: null,
      currentVersionId: newVersionId,
      usageCount: 0,
      recipientRoles: roles,
      fields: source.fields.map((field) => ({
        ...field,
        id: crypto.randomUUID(),
        templateId,
        versionId: newVersionId,
        recipientRoleId: field.recipientRoleId ? roleIdMapping.get(field.recipientRoleId) || null : null,
      })),
      pageAssignments: source.pageAssignments.map((assignment) => ({
        ...assignment,
        id: crypto.randomUUID(),
        templateId,
        versionId: newVersionId,
        assignedRoleIds: assignment.assignedRoleIds.map((roleId) => roleIdMapping.get(roleId) || roleId),
      })),
      documents: source.documents.map((doc, index) => ({
        ...doc,
        id: crypto.randomUUID(),
        templateId,
        versionId: newVersionId,
        sortOrder: index + 1,
      })),
      versions: [
        {
          id: newVersionId,
          templateId,
          versionNumber: 1,
          title: source.title,
          message: source.message,
          description: source.description,
          documentMetadata: source.documents,
          recipientRoles: roles,
          fields: source.fields,
          pageAssignments: source.pageAssignments,
          createdByUserId: input.actor.userId,
          createdAt: now,
          changeSummary: `Duplicated from template ${source.id}`,
          isCurrent: true,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
    const created = await this.repos.templates.create(duplicate);
    await addAuditEvent({
      officeId: created.officeId,
      envelopeId: created.id,
      recipientId: null,
      type: "template_duplicated",
      message: `Template duplicated: ${created.name}`,
      ipAddress: null,
      userAgent: null,
      metadata: { sourceTemplateId: source.id, newTemplateId: created.id },
    });
    return created;
  }

  async updateStatus(input: {
    actor: { userId: string; role: string };
    template: TemplateRecord;
    nextStatus: TemplateRecord["status"];
    /** When true, Use-template flow can publish without full field/page checks. */
    skipPublishValidation?: boolean;
  }) {
    const template = { ...input.template };
    if (template.visibility === "global" && input.actor.role !== "super_admin") {
      throw new Error("Only super admins may manage global templates.");
    }
    template.status = input.nextStatus;
    if (input.nextStatus === "published") template.publishedAt = nowIso();
    if (input.nextStatus === "archived") template.archivedAt = nowIso();
    if (input.nextStatus === "draft") {
      template.publishedAt = null;
      template.archivedAt = null;
    }
    template.updatedAt = nowIso();

    if (input.nextStatus === "published" && !input.skipPublishValidation) {
      const validation = validateTemplateForPublish({
        template,
        roles: template.recipientRoles,
        fields: template.fields,
        pageAssignments: template.pageAssignments,
        documents: template.documents,
      });
      if (!validation.ok) throw new Error(validation.errors.join(" "));
    } else if (input.nextStatus === "published" && input.skipPublishValidation) {
      if (!template.name.trim()) throw new Error("Template name is required.");
      if (!template.recipientRoles.length) throw new Error("Add at least one recipient before using this template.");
    }
    const updated = await this.repos.templates.update(template);
    const eventByStatus: Record<TemplateRecord["status"], AuditEventType> = {
      draft: "template_unpublished",
      published: "template_published",
      archived: "template_archived",
    };
    await addAuditEvent({
      officeId: updated.officeId,
      envelopeId: updated.id,
      recipientId: null,
      type: eventByStatus[input.nextStatus],
      message: `Template status updated to ${input.nextStatus}`,
      ipAddress: null,
      userAgent: null,
      metadata: { templateId: updated.id, status: updated.status },
    });
    return updated;
  }

  async deleteTemplate(input: {
    actor: { userId: string; email: string; role: string };
    template: TemplateRecord;
  }) {
    const { template } = input;
    if (template.visibility === "global" && input.actor.role !== "super_admin") {
      throw new Error("Only super admins may delete global templates.");
    }

    const documentPaths = new Set<string>();
    for (const doc of template.documents) {
      if (doc.filePath) documentPaths.add(doc.filePath);
    }
    for (const version of template.versions) {
      for (const doc of version.documentMetadata || []) {
        if (doc.filePath) documentPaths.add(doc.filePath);
      }
    }

    await this.repos.templates.delete(template.id);

    for (const relativePath of documentPaths) {
      const absolutePath = path.isAbsolute(relativePath)
        ? relativePath
        : path.join(process.cwd(), relativePath.replace(/^[/\\]+/, ""));
      try {
        await unlink(absolutePath);
      } catch {
        // File may already be missing.
      }
    }

    await addAuditEvent({
      officeId: template.officeId,
      envelopeId: template.id,
      recipientId: null,
      type: "template_deleted",
      message: `Template deleted: ${template.name}`,
      ipAddress: null,
      userAgent: null,
      metadata: { templateId: template.id, deletedBy: input.actor.email },
    });
  }

  async restoreTemplateVersion(input: {
    actor: { userId: string };
    template: TemplateRecord;
    versionId: string;
  }) {
    const restored = await this.versionService.restoreVersion(input.template, input.versionId, input.actor.userId);
    await addAuditEvent({
      officeId: input.template.officeId,
      envelopeId: input.template.id,
      recipientId: null,
      type: "template_version_restored",
      message: `Template version restored (${restored.versionNumber})`,
      ipAddress: null,
      userAgent: null,
      metadata: { templateId: input.template.id, restoredVersionId: restored.id },
    });
    return restored;
  }

  async reorderRole(versionId: string, roleId: string, direction: "up" | "down") {
    const roles = await this.repos.roles.listByVersionId(versionId);
    const ordered = [...roles].sort((a, b) => a.signingOrder - b.signingOrder);
    const index = ordered.findIndex((role) => role.id === roleId);
    if (index < 0) return ordered;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= ordered.length) return ordered;
    [ordered[index], ordered[targetIndex]] = [ordered[targetIndex], ordered[index]];
    const now = nowIso();
    for (let i = 0; i < ordered.length; i += 1) {
      ordered[i].signingOrder = i + 1;
      ordered[i].signingStep = i + 1;
      ordered[i].updatedAt = now;
    }
    await this.repos.roles.replaceForVersion(versionId, ordered);
    return ordered;
  }

  async listVersions(templateId: string): Promise<TemplateVersionRecord[]> {
    return this.versionService.list(templateId);
  }

  async listPageAssignments(versionId: string): Promise<TemplatePageAssignmentRecord[]> {
    return this.pageAssignmentService.list(versionId);
  }
}

export function createTemplateService(repos?: TemplateRepositories) {
  return new TemplateService(repos);
}

