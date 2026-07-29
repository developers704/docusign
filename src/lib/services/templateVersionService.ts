import crypto from "node:crypto";
import type {
  TemplateDocumentRecord,
  TemplateFieldRecord,
  TemplatePageAssignmentRecord,
  TemplateRecipientRoleRecord,
  TemplateRecord,
  TemplateVersionRecord,
} from "@/lib/types";
import type { TemplateVersionRepository } from "@/lib/repositories/templateRepositories";

export class TemplateVersionService {
  constructor(private readonly versions: TemplateVersionRepository) {}

  async list(templateId: string) {
    const records = await this.versions.listByTemplateId(templateId);
    return records.sort((a, b) => b.versionNumber - a.versionNumber);
  }

  async createVersion(input: {
    template: TemplateRecord;
    title: string;
    message: string;
    description: string;
    documents: TemplateDocumentRecord[];
    roles: TemplateRecipientRoleRecord[];
    fields: TemplateFieldRecord[];
    pageAssignments: TemplatePageAssignmentRecord[];
    createdByUserId: string;
    changeSummary: string;
    makeCurrent: boolean;
  }) {
    const previous = await this.versions.listByTemplateId(input.template.id);
    const nextNumber = previous.length ? Math.max(...previous.map((version) => version.versionNumber)) + 1 : 1;
    const record: TemplateVersionRecord = {
      id: crypto.randomUUID(),
      templateId: input.template.id,
      versionNumber: nextNumber,
      title: input.title,
      message: input.message,
      description: input.description,
      documentMetadata: input.documents,
      recipientRoles: input.roles,
      fields: input.fields,
      pageAssignments: input.pageAssignments,
      createdByUserId: input.createdByUserId,
      createdAt: new Date().toISOString(),
      changeSummary: input.changeSummary,
      isCurrent: input.makeCurrent,
    };
    return this.versions.create(record);
  }

  async restoreVersion(template: TemplateRecord, versionId: string, actorUserId: string) {
    const versions = await this.versions.listByTemplateId(template.id);
    const found = versions.find((version) => version.id === versionId);
    if (!found) throw new Error("Template version not found.");
    return this.createVersion({
      template,
      title: found.title,
      message: found.message,
      description: found.description,
      documents: found.documentMetadata,
      roles: found.recipientRoles,
      fields: found.fields,
      pageAssignments: found.pageAssignments,
      createdByUserId: actorUserId,
      changeSummary: `Restored from version ${found.versionNumber}`,
      makeCurrent: true,
    });
  }
}

