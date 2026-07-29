/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "node:crypto";
import { isDatabaseConfigured } from "@/lib/db";
import * as mysqlStore from "@/lib/mysqlStore";
import { readTemplates, writeTemplates } from "@/lib/store";
import type {
  TemplateDocumentRecord,
  TemplateFieldRecord,
  TemplatePageAssignmentRecord,
  TemplateRecipientRoleRecord,
  TemplateRecord,
  TemplateVersionRecord,
} from "@/lib/types";
import type {
  TemplateDocumentRepository,
  TemplateFieldRepository,
  TemplateListFilter,
  TemplatePageAssignmentRepository,
  TemplateRecipientRoleRepository,
  TemplateRepositories,
  TemplateRepository,
  TemplateVersionRepository,
} from "./templateRepositories";

const CURRENT_SCHEMA_VERSION = 2;

function nowIso() {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeRole(raw: any, templateId: string, versionId: string, index: number): TemplateRecipientRoleRecord {
  const now = nowIso();
  return {
    id: String(raw?.id || crypto.randomUUID()),
    templateId,
    versionId,
    roleName: String(raw?.roleName || raw?.name || `Signer ${index + 1}`),
    roleType: raw?.roleType || "signer",
    signingOrder: Number.isFinite(raw?.signingOrder) ? Number(raw.signingOrder) : index + 1,
    signingStep: Number.isFinite(raw?.signingStep) ? Number(raw.signingStep) : index + 1,
    isRequired: raw?.isRequired !== false && raw?.required !== false,
    canEditFields: raw?.canEditFields !== false,
    canViewAllPages: raw?.canViewAllPages !== false,
    defaultName: String(raw?.defaultName || "").trim() || undefined,
    defaultEmail: String(raw?.defaultEmail || "").trim().toLowerCase() || undefined,
    createdAt: String(raw?.createdAt || now),
    updatedAt: String(raw?.updatedAt || now),
  };
}

function normalizeField(raw: any, templateId: string, versionId: string): TemplateFieldRecord {
  const now = nowIso();
  return {
    id: String(raw?.id || crypto.randomUUID()),
    type: String(raw?.type || "text") as TemplateFieldRecord["type"],
    templateId,
    versionId,
    documentId: raw?.documentId ? String(raw.documentId) : null,
    page: Math.max(1, Number(raw?.page || 1)),
    x: Number(raw?.x || 0),
    y: Number(raw?.y || 0),
    width: Number(raw?.width || 20),
    height: Number(raw?.height || 5),
    recipientRoleId: raw?.recipientRoleId ? String(raw.recipientRoleId) : raw?.roleId ? String(raw.roleId) : null,
    required: raw?.required !== false,
    readOnly: Boolean(raw?.readOnly),
    hidden: Boolean(raw?.hidden),
    locked: Boolean(raw?.locked),
    label: String(raw?.label || "Field"),
    fieldName: String(raw?.fieldName || raw?.label || "field"),
    internalKey: String(raw?.internalKey || raw?.id || crypto.randomUUID()),
    placeholder: String(raw?.placeholder || ""),
    helpText: String(raw?.helpText || ""),
    tooltip: String(raw?.tooltip || ""),
    defaultValue: String(raw?.defaultValue || ""),
    validationRule: String(raw?.validationRule || ""),
    minimumLength: Number.isFinite(raw?.minimumLength) ? Number(raw.minimumLength) : null,
    maximumLength: Number.isFinite(raw?.maximumLength) ? Number(raw.maximumLength) : null,
    minimumValue: Number.isFinite(raw?.minimumValue) ? Number(raw.minimumValue) : null,
    maximumValue: Number.isFinite(raw?.maximumValue) ? Number(raw.maximumValue) : null,
    regexPattern: String(raw?.regexPattern || ""),
    tabOrder: Number.isFinite(raw?.tabOrder) ? Number(raw.tabOrder) : null,
    fontSize: Number.isFinite(raw?.fontSize) ? Number(raw.fontSize) : null,
    alignment: raw?.alignment === "center" || raw?.alignment === "right" ? raw.alignment : "left",
    conditionalVisibility: String(raw?.conditionalVisibility || ""),
    createdAt: String(raw?.createdAt || now),
    updatedAt: String(raw?.updatedAt || now),
  };
}

function normalizeAssignment(raw: any, templateId: string, versionId: string): TemplatePageAssignmentRecord {
  const now = nowIso();
  return {
    id: String(raw?.id || crypto.randomUUID()),
    templateId,
    versionId,
    documentId: raw?.documentId ? String(raw.documentId) : null,
    pageNumber: Math.max(1, Number(raw?.pageNumber || raw?.page || 1)),
    pageLabel: String(raw?.pageLabel || ""),
    assignedRoleIds: Array.isArray(raw?.assignedRoleIds)
      ? raw.assignedRoleIds.map(String)
      : Array.isArray(raw?.roleIds)
      ? raw.roleIds.map(String)
      : [],
    responsibilityType: raw?.responsibilityType || raw?.responsibility || "must_sign",
    visibility: raw?.visibility || "assigned_recipients_only",
    isRequired: raw?.isRequired !== false && raw?.required !== false,
    signingStep: Number.isFinite(raw?.signingStep) ? Number(raw.signingStep) : null,
    allowComments: Boolean(raw?.allowComments),
    allowAttachments: Boolean(raw?.allowAttachments),
    readOnly: Boolean(raw?.readOnly),
    createdAt: String(raw?.createdAt || now),
    updatedAt: String(raw?.updatedAt || now),
  };
}

function normalizeDocument(raw: any, templateId: string, versionId: string, index: number): TemplateDocumentRecord {
  return {
    id: String(raw?.id || crypto.randomUUID()),
    templateId,
    versionId,
    originalFileName: String(raw?.originalFileName || ""),
    storedFileName: String(raw?.storedFileName || ""),
    filePath: String(raw?.filePath || ""),
    mimeType: String(raw?.mimeType || "application/pdf"),
    fileSize: Math.max(0, Number(raw?.fileSize || 0)),
    pageCount: Math.max(0, Number(raw?.pageCount || 0)),
    sha256: String(raw?.sha256 || ""),
    sortOrder: Number.isFinite(raw?.sortOrder) ? Number(raw.sortOrder) : index + 1,
    createdAt: String(raw?.createdAt || nowIso()),
  };
}

function normalizeTemplate(raw: any): TemplateRecord {
  const templateId = String(raw?.id || crypto.randomUUID());
  const createdAt = String(raw?.createdAt || nowIso());
  const updatedAt = String(raw?.updatedAt || createdAt);
  const currentVersionId = String(raw?.currentVersionId || crypto.randomUUID());
  const roles = (Array.isArray(raw?.recipientRoles) ? raw.recipientRoles : []).map((role: any, index: number) =>
    normalizeRole(role, templateId, currentVersionId, index)
  );
  const fields = (Array.isArray(raw?.fields) ? raw.fields : []).map((field: any) => normalizeField(field, templateId, currentVersionId));
  const assignments = (Array.isArray(raw?.pageAssignments) ? raw.pageAssignments : []).map((item: any) =>
    normalizeAssignment(item, templateId, currentVersionId)
  );
  const documents = (Array.isArray(raw?.documents) ? raw.documents : []).map((item: any, index: number) =>
    normalizeDocument(item, templateId, currentVersionId, index)
  );

  const versions: TemplateVersionRecord[] = Array.isArray(raw?.versions) && raw.versions.length
    ? raw.versions.map((version: any, index: number) => {
        const versionId = String(version?.id || crypto.randomUUID());
        return {
          id: versionId,
          templateId,
          versionNumber: Number.isFinite(version?.versionNumber) ? Number(version.versionNumber) : index + 1,
          title: String(version?.title || raw?.title || ""),
          message: String(version?.message || raw?.message || ""),
          description: String(version?.description || raw?.description || ""),
          documentMetadata: (() => {
            const fromVersion = Array.isArray(version?.documentMetadata) ? version.documentMetadata : [];
            // Recover top-level documents when version metadata was wiped (common after split-store bugs).
            const source =
              fromVersion.length > 0
                ? fromVersion
                : documents.length > 0 &&
                    (Boolean(version?.isCurrent) || versionId === currentVersionId || !(Array.isArray(raw?.versions) && raw.versions.length > 1))
                  ? (Array.isArray(raw?.documents) ? raw.documents : documents)
                  : [];
            return source.map((doc: any, docIndex: number) => normalizeDocument(doc, templateId, versionId, docIndex));
          })(),
          recipientRoles: (Array.isArray(version?.recipientRoles) ? version.recipientRoles : roles).map((role: any, roleIndex: number) =>
            normalizeRole(role, templateId, versionId, roleIndex)
          ),
          fields: (Array.isArray(version?.fields) ? version.fields : fields).map((field: any) => normalizeField(field, templateId, versionId)),
          pageAssignments: (Array.isArray(version?.pageAssignments) ? version.pageAssignments : assignments).map((item: any) =>
            normalizeAssignment(item, templateId, versionId)
          ),
          createdByUserId: String(version?.createdByUserId || raw?.ownerUserId || "unknown"),
          createdAt: String(version?.createdAt || createdAt),
          changeSummary: String(version?.changeSummary || "Updated"),
          isCurrent: Boolean(version?.isCurrent),
        } as TemplateVersionRecord;
      })
    : [
        {
          id: currentVersionId,
          templateId,
          versionNumber: 1,
          title: String(raw?.title || ""),
          message: String(raw?.message || ""),
          description: String(raw?.description || ""),
          documentMetadata: documents,
          recipientRoles: roles,
          fields,
          pageAssignments: assignments,
          createdByUserId: String(raw?.ownerUserId || "unknown"),
          createdAt,
          changeSummary: "Migrated from legacy template schema",
          isCurrent: true,
        },
      ];

  const actualCurrentVersionId = versions.find((version) => version.isCurrent)?.id || versions[versions.length - 1].id;
  for (const version of versions) version.isCurrent = version.id === actualCurrentVersionId;
  const currentVersion = versions.find((version) => version.id === actualCurrentVersionId) || versions[0];

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: templateId,
    officeId: String(raw?.officeId || ""),
    ownerUserId: raw?.ownerUserId ? String(raw.ownerUserId) : null,
    name: String(raw?.name || "Untitled Template"),
    title: String(raw?.title || ""),
    description: String(raw?.description || ""),
    message: String(raw?.message || ""),
    content: typeof raw?.content === "string" ? raw.content : undefined,
    sourceType: raw?.sourceType === "uploaded_pdf" ? "uploaded_pdf" : "policy_text",
    category: String(raw?.category || ""),
    tags: Array.isArray(raw?.tags) ? raw.tags.map(String) : [],
    status: raw?.status || "draft",
    visibility: raw?.visibility || "office",
    selectedOfficeIds: Array.isArray(raw?.selectedOfficeIds) ? raw.selectedOfficeIds.map(String) : [],
    selectedGroupIds: Array.isArray(raw?.selectedGroupIds) ? raw.selectedGroupIds.map(String) : [],
    publishedAt: raw?.publishedAt ? String(raw.publishedAt) : null,
    archivedAt: raw?.archivedAt ? String(raw.archivedAt) : null,
    currentVersionId: actualCurrentVersionId,
    usageCount: Number.isFinite(raw?.usageCount) ? Number(raw.usageCount) : 0,
    expiryDays: Number.isFinite(raw?.expiryDays) ? Number(raw.expiryDays) : 0,
    internalNotes: String(raw?.internalNotes || ""),
    folderIds: Array.isArray(raw?.folderIds) ? raw.folderIds.map(String) : [],
    matchingEligible: raw?.matchingEligible !== false,
    recipientRoles: clone(currentVersion.recipientRoles),
    fields: clone(currentVersion.fields),
    pageAssignments: clone(currentVersion.pageAssignments),
    documents: clone(currentVersion.documentMetadata),
    versions,
    createdAt,
    updatedAt,
  };
}

async function readTemplatesNormalized() {
  // Use shared store queue so TemplateService + folder/matching actions never race-write templates.json.
  const rawTemplates = await readTemplates();
  const normalized = rawTemplates.map(normalizeTemplate);
  if (JSON.stringify(rawTemplates) !== JSON.stringify(normalized)) {
    await writeTemplates(normalized);
  }
  return normalized;
}

async function writeTemplatesNormalized(templates: TemplateRecord[]) {
  await writeTemplates(templates.map(normalizeTemplate));
}

async function importTemplateFromMysqlIfMissing(id: string): Promise<TemplateRecord | undefined> {
  if (!isDatabaseConfigured()) return undefined;
  try {
    const fromDb = await mysqlStore.mysqlReadTemplates();
    const hit = fromDb.find((item) => item.id === id);
    if (!hit) return undefined;
    const normalized = normalizeTemplate(hit);
    const templates = await readTemplatesNormalized();
    if (!templates.some((item) => item.id === id)) {
      templates.push(normalized);
      await writeTemplatesNormalized(templates);
    }
    return normalized;
  } catch (error) {
    console.error("[templates] MySQL recovery failed:", error);
    return undefined;
  }
}

class JsonTemplateRepositoryImpl implements TemplateRepository {
  async list(filter?: TemplateListFilter): Promise<TemplateRecord[]> {
    const templates = await readTemplatesNormalized();
    return templates.filter((template) => {
      if (filter?.officeId) {
        const officeOwned = template.officeId === filter.officeId;
        const globalAllowed = Boolean(filter.includeGlobal) && template.visibility === "global";
        if (!officeOwned && !globalAllowed) return false;
      }
      if (filter?.ownerUserId && template.ownerUserId !== filter.ownerUserId) return false;
      if (filter?.status && template.status !== filter.status) return false;
      return true;
    });
  }

  async getById(id: string): Promise<TemplateRecord | undefined> {
    const templates = await readTemplatesNormalized();
    const found = templates.find((template) => template.id === id);
    if (found) return found;
    return importTemplateFromMysqlIfMissing(id);
  }

  async create(record: TemplateRecord): Promise<TemplateRecord> {
    const templates = await readTemplatesNormalized();
    templates.push(normalizeTemplate(record));
    await writeTemplatesNormalized(templates);
    return clone(record);
  }

  async update(record: TemplateRecord): Promise<TemplateRecord> {
    const templates = await readTemplatesNormalized();
    const index = templates.findIndex((template) => template.id === record.id);
    if (index < 0) throw new Error("Template not found.");
    templates[index] = normalizeTemplate(record);
    await writeTemplatesNormalized(templates);
    return clone(templates[index]);
  }

  async delete(id: string): Promise<void> {
    const templates = await readTemplatesNormalized();
    const index = templates.findIndex((template) => template.id === id);
    if (index < 0) throw new Error("Template not found.");
    templates.splice(index, 1);
    await writeTemplatesNormalized(templates);
  }
}

class JsonTemplateVersionRepositoryImpl implements TemplateVersionRepository {
  constructor(private readonly templates: TemplateRepository) {}

  async listByTemplateId(templateId: string): Promise<TemplateVersionRecord[]> {
    const template = await this.templates.getById(templateId);
    return clone(template?.versions || []);
  }

  async getById(versionId: string): Promise<TemplateVersionRecord | undefined> {
    const allTemplates = await this.templates.list();
    for (const template of allTemplates) {
      const version = template.versions.find((item) => item.id === versionId);
      if (version) return clone(version);
    }
    return undefined;
  }

  async create(version: TemplateVersionRecord): Promise<TemplateVersionRecord> {
    const template = await this.templates.getById(version.templateId);
    if (!template) throw new Error("Template not found.");
    for (const existing of template.versions) existing.isCurrent = false;
    template.versions.push(clone(version));
    template.currentVersionId = version.id;
    template.title = version.title;
    template.message = version.message;
    template.description = version.description;
    template.recipientRoles = clone(version.recipientRoles);
    template.fields = clone(version.fields);
    template.pageAssignments = clone(version.pageAssignments);
    template.documents = clone(version.documentMetadata);
    template.updatedAt = nowIso();
    await this.templates.update(template);
    return clone(version);
  }

  async update(version: TemplateVersionRecord): Promise<TemplateVersionRecord> {
    const template = await this.templates.getById(version.templateId);
    if (!template) throw new Error("Template not found.");
    const index = template.versions.findIndex((item) => item.id === version.id);
    if (index < 0) throw new Error("Template version not found.");
    template.versions[index] = clone(version);
    if (version.isCurrent) {
      for (const item of template.versions) item.isCurrent = item.id === version.id;
      template.currentVersionId = version.id;
      template.title = version.title;
      template.message = version.message;
      template.description = version.description;
      template.recipientRoles = clone(version.recipientRoles);
      template.fields = clone(version.fields);
      template.pageAssignments = clone(version.pageAssignments);
      template.documents = clone(version.documentMetadata);
    }
    template.updatedAt = nowIso();
    await this.templates.update(template);
    return clone(version);
  }
}

abstract class JsonVersionSliceRepository<T> {
  constructor(private readonly templates: TemplateRepository, private readonly versions: TemplateVersionRepository) {}
  protected abstract getSlice(version: TemplateVersionRecord): T[];
  protected abstract setSlice(version: TemplateVersionRecord, values: T[]): void;

  async listByVersionId(versionId: string): Promise<T[]> {
    const version = await this.versions.getById(versionId);
    return clone(version ? this.getSlice(version) : []);
  }

  async replaceForVersion(versionId: string, values: T[]): Promise<void> {
    const version = await this.versions.getById(versionId);
    if (!version) throw new Error("Template version not found.");
    this.setSlice(version, clone(values));
    await this.versions.update(version);
    const template = await this.templates.getById(version.templateId);
    if (!template) return;
    if (template.currentVersionId === versionId) {
      template.updatedAt = nowIso();
      await this.templates.update(template);
    }
  }
}

class JsonTemplateDocumentRepositoryImpl
  extends JsonVersionSliceRepository<TemplateDocumentRecord>
  implements TemplateDocumentRepository
{
  protected getSlice(version: TemplateVersionRecord) { return version.documentMetadata; }
  protected setSlice(version: TemplateVersionRecord, values: TemplateDocumentRecord[]) { version.documentMetadata = values; }
}

class JsonTemplateRoleRepositoryImpl
  extends JsonVersionSliceRepository<TemplateRecipientRoleRecord>
  implements TemplateRecipientRoleRepository
{
  protected getSlice(version: TemplateVersionRecord) { return version.recipientRoles; }
  protected setSlice(version: TemplateVersionRecord, values: TemplateRecipientRoleRecord[]) { version.recipientRoles = values; }
}

class JsonTemplateFieldRepositoryImpl
  extends JsonVersionSliceRepository<TemplateFieldRecord>
  implements TemplateFieldRepository
{
  protected getSlice(version: TemplateVersionRecord) { return version.fields; }
  protected setSlice(version: TemplateVersionRecord, values: TemplateFieldRecord[]) { version.fields = values; }
}

class JsonTemplatePageAssignmentRepositoryImpl
  extends JsonVersionSliceRepository<TemplatePageAssignmentRecord>
  implements TemplatePageAssignmentRepository
{
  protected getSlice(version: TemplateVersionRecord) { return version.pageAssignments; }
  protected setSlice(version: TemplateVersionRecord, values: TemplatePageAssignmentRecord[]) { version.pageAssignments = values; }
}

export function createJsonTemplateRepositories(): TemplateRepositories {
  const templates = new JsonTemplateRepositoryImpl();
  const versions = new JsonTemplateVersionRepositoryImpl(templates);
  return {
    templates,
    versions,
    documents: new JsonTemplateDocumentRepositoryImpl(templates, versions),
    roles: new JsonTemplateRoleRepositoryImpl(templates, versions),
    fields: new JsonTemplateFieldRepositoryImpl(templates, versions),
    pageAssignments: new JsonTemplatePageAssignmentRepositoryImpl(templates, versions),
  };
}

export const TEMPLATE_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;

