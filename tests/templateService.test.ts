import test from "node:test";
import assert from "node:assert/strict";
import type {
  TemplateDocumentRecord,
  TemplateFieldRecord,
  TemplatePageAssignmentRecord,
  TemplateRecipientRoleRecord,
  TemplateRecord,
  TemplateVersionRecord,
} from "@/lib/types";
import type { TemplateRepositories } from "@/lib/repositories/templateRepositories";
import { TemplateService } from "@/lib/services/templateService";
import { validateTemplateForPublish } from "@/lib/services/templateValidationService";

function sampleTemplate(): TemplateRecord {
  const now = new Date().toISOString();
  const templateId = "t1";
  const versionId = "v1";
  const roles: TemplateRecipientRoleRecord[] = [
    {
      id: "r1",
      templateId,
      versionId,
      roleName: "Signer",
      roleType: "signer",
      signingOrder: 1,
      signingStep: 1,
      isRequired: true,
      canEditFields: true,
      canViewAllPages: false,
      createdAt: now,
      updatedAt: now,
    },
  ];
  const fields: TemplateFieldRecord[] = [
    {
      id: "f1",
      type: "signature",
      templateId,
      versionId,
      documentId: null,
      page: 1,
      x: 10,
      y: 10,
      width: 20,
      height: 5,
      recipientRoleId: "r1",
      required: true,
      readOnly: false,
      hidden: false,
      locked: false,
      label: "Signature",
      fieldName: "signature",
      internalKey: "signature_1",
      placeholder: "",
      helpText: "",
      tooltip: "",
      defaultValue: "",
      validationRule: "",
      minimumLength: null,
      maximumLength: null,
      minimumValue: null,
      maximumValue: null,
      regexPattern: "",
      tabOrder: 1,
      fontSize: null,
      alignment: "left",
      conditionalVisibility: "",
      createdAt: now,
      updatedAt: now,
    },
  ];
  const pages: TemplatePageAssignmentRecord[] = [
    {
      id: "p1",
      templateId,
      versionId,
      documentId: null,
      pageNumber: 1,
      pageLabel: "Page 1",
      assignedRoleIds: ["r1"],
      responsibilityType: "must_sign",
      visibility: "assigned_recipients_only",
      isRequired: true,
      signingStep: 1,
      allowComments: false,
      allowAttachments: false,
      readOnly: false,
      createdAt: now,
      updatedAt: now,
    },
  ];
  const docs: TemplateDocumentRecord[] = [
    {
      id: "d1",
      templateId,
      versionId,
      originalFileName: "doc.pdf",
      storedFileName: "doc.pdf",
      filePath: "storage/offices/o1/templates/doc.pdf",
      mimeType: "application/pdf",
      fileSize: 100,
      pageCount: 1,
      sha256: "abc",
      sortOrder: 1,
      createdAt: now,
    },
  ];
  const version: TemplateVersionRecord = {
    id: versionId,
    templateId,
    versionNumber: 1,
    title: "T",
    message: "M",
    description: "D",
    documentMetadata: docs,
    recipientRoles: roles,
    fields,
    pageAssignments: pages,
    createdByUserId: "u1",
    createdAt: now,
    changeSummary: "init",
    isCurrent: true,
  };
  return {
    schemaVersion: 2,
    id: templateId,
    officeId: "o1",
    ownerUserId: "u1",
    name: "Template",
    title: "T",
    description: "D",
    message: "M",
    content: "Body",
    sourceType: "policy_text",
    category: "",
    tags: [],
    status: "draft",
    visibility: "office",
    selectedOfficeIds: [],
    selectedGroupIds: [],
    publishedAt: null,
    archivedAt: null,
    currentVersionId: versionId,
    usageCount: 0,
    expiryDays: 14,
    internalNotes: "",
    folderIds: [],
    matchingEligible: true,
    recipientRoles: roles,
    fields,
    pageAssignments: pages,
    documents: docs,
    versions: [version],
    createdAt: now,
    updatedAt: now,
  };
}

function createMemoryRepos(initial: TemplateRecord[] = []): TemplateRepositories {
  const templates = [...initial];
  return {
    templates: {
      async list(filter) {
        return templates.filter((template) => {
          if (filter?.officeId && template.officeId !== filter.officeId) return false;
          if (filter?.status && template.status !== filter.status) return false;
          return true;
        });
      },
      async getById(id) {
        return templates.find((item) => item.id === id);
      },
      async create(record) {
        templates.push(record);
        return record;
      },
      async update(record) {
        const index = templates.findIndex((item) => item.id === record.id);
        if (index >= 0) templates[index] = record;
        return record;
      },
      async delete(id) {
        const index = templates.findIndex((item) => item.id === id);
        if (index < 0) throw new Error("Template not found.");
        templates.splice(index, 1);
      },
    },
    versions: {
      async listByTemplateId(templateId) {
        return templates.find((item) => item.id === templateId)?.versions || [];
      },
      async getById(versionId) {
        for (const template of templates) {
          const version = template.versions.find((item) => item.id === versionId);
          if (version) return version;
        }
        return undefined;
      },
      async create(version) {
        const template = templates.find((item) => item.id === version.templateId);
        if (!template) throw new Error("Template not found.");
        for (const existing of template.versions) existing.isCurrent = false;
        template.versions.push(version);
        template.currentVersionId = version.id;
        template.recipientRoles = version.recipientRoles;
        template.fields = version.fields;
        template.pageAssignments = version.pageAssignments;
        template.documents = version.documentMetadata;
        return version;
      },
      async update(version) {
        const template = templates.find((item) => item.id === version.templateId);
        if (!template) throw new Error("Template not found.");
        const index = template.versions.findIndex((item) => item.id === version.id);
        if (index >= 0) template.versions[index] = version;
        return version;
      },
    },
    documents: {
      async listByVersionId(versionId) {
        const t = templates.find((template) => template.versions.some((v) => v.id === versionId));
        return t?.versions.find((v) => v.id === versionId)?.documentMetadata || [];
      },
      async replaceForVersion() {},
    },
    roles: {
      async listByVersionId(versionId) {
        const t = templates.find((template) => template.versions.some((v) => v.id === versionId));
        return t?.versions.find((v) => v.id === versionId)?.recipientRoles || [];
      },
      async replaceForVersion(versionId, roles) {
        const t = templates.find((template) => template.versions.some((v) => v.id === versionId));
        const version = t?.versions.find((v) => v.id === versionId);
        if (version) version.recipientRoles = roles;
      },
    },
    fields: {
      async listByVersionId(versionId) {
        const t = templates.find((template) => template.versions.some((v) => v.id === versionId));
        return t?.versions.find((v) => v.id === versionId)?.fields || [];
      },
      async replaceForVersion() {},
    },
    pageAssignments: {
      async listByVersionId(versionId) {
        const t = templates.find((template) => template.versions.some((v) => v.id === versionId));
        return t?.versions.find((v) => v.id === versionId)?.pageAssignments || [];
      },
      async replaceForVersion() {},
    },
  };
}

test("publish validation rejects missing role references", () => {
  const template = sampleTemplate();
  const invalidFields = [{ ...template.fields[0], recipientRoleId: "missing-role" }];
  const result = validateTemplateForPublish({
    template,
    roles: template.recipientRoles,
    fields: invalidFields,
    pageAssignments: template.pageAssignments,
    documents: template.documents,
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((message) => message.includes("missing role")));
});

test("non-super admin cannot create global template", async () => {
  const repos = createMemoryRepos();
  const service = new TemplateService(repos);
  await assert.rejects(
    () =>
      service.createTemplate({
        actor: { userId: "u1", email: "user@example.com", role: "office_admin" },
        officeId: "o1",
        name: "N",
        title: "T",
        description: "",
        message: "",
        content: "Body",
        category: "",
        tags: [],
        visibility: "global",
        selectedOfficeIds: [],
        selectedGroupIds: [],
        roleNames: ["Signer"],
        sourceType: "policy_text",
        expiryDays: 14,
        internalNotes: "",
      }),
    /Only super admins/
  );
});

test("role reorder updates signing order", async () => {
  const template = sampleTemplate();
  template.recipientRoles.push({
    ...template.recipientRoles[0],
    id: "r2",
    roleName: "Approver",
    signingOrder: 2,
    signingStep: 2,
  });
  template.versions[0].recipientRoles = template.recipientRoles;
  const repos = createMemoryRepos([template]);
  const service = new TemplateService(repos);
  const result = await service.reorderRole("v1", "r2", "up");
  assert.equal(result[0].id, "r2");
  assert.equal(result[0].signingOrder, 1);
});

test("updateTemplate updates template metadata and roles", async () => {
  const template = sampleTemplate();
  const repos = createMemoryRepos([template]);
  const service = new TemplateService(repos);
  const updated = await service.updateTemplate({
    actor: { userId: "u1", email: "admin@example.com", role: "office_admin" },
    template,
    name: "Updated Name",
    title: "Updated Title",
    description: "New description",
    message: "New message",
    content: "Updated body content for the template.",
    category: "HR",
    tags: ["onboarding"],
    roleNames: ["Signer", "Manager"],
    internalNotes: "Internal note",
  });
  assert.equal(updated.name, "Updated Name");
  assert.equal(updated.recipientRoles.length, 2);
  assert.equal(updated.recipientRoles[1].roleName, "Manager");
});

test("deleteTemplate removes template from repository", async () => {
  const template = sampleTemplate();
  const repos = createMemoryRepos([template]);
  const service = new TemplateService(repos);
  await service.deleteTemplate({
    actor: { userId: "u1", email: "admin@example.com", role: "office_admin" },
    template,
  });
  assert.equal(await service.getById("t1"), undefined);
});

