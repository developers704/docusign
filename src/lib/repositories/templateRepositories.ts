import type {
  TemplateDocumentRecord,
  TemplateFieldRecord,
  TemplatePageAssignmentRecord,
  TemplateRecipientRoleRecord,
  TemplateRecord,
  TemplateVersionRecord,
} from "@/lib/types";

export type TemplateListFilter = {
  officeId?: string;
  includeGlobal?: boolean;
  ownerUserId?: string;
  status?: TemplateRecord["status"];
};

export interface TemplateRepository {
  list(filter?: TemplateListFilter): Promise<TemplateRecord[]>;
  getById(id: string): Promise<TemplateRecord | undefined>;
  create(record: TemplateRecord): Promise<TemplateRecord>;
  update(record: TemplateRecord): Promise<TemplateRecord>;
  delete(id: string): Promise<void>;
}

export interface TemplateVersionRepository {
  listByTemplateId(templateId: string): Promise<TemplateVersionRecord[]>;
  getById(versionId: string): Promise<TemplateVersionRecord | undefined>;
  create(version: TemplateVersionRecord): Promise<TemplateVersionRecord>;
  update(version: TemplateVersionRecord): Promise<TemplateVersionRecord>;
}

export interface TemplateDocumentRepository {
  listByVersionId(versionId: string): Promise<TemplateDocumentRecord[]>;
  replaceForVersion(versionId: string, documents: TemplateDocumentRecord[]): Promise<void>;
}

export interface TemplateRecipientRoleRepository {
  listByVersionId(versionId: string): Promise<TemplateRecipientRoleRecord[]>;
  replaceForVersion(versionId: string, roles: TemplateRecipientRoleRecord[]): Promise<void>;
}

export interface TemplateFieldRepository {
  listByVersionId(versionId: string): Promise<TemplateFieldRecord[]>;
  replaceForVersion(versionId: string, fields: TemplateFieldRecord[]): Promise<void>;
}

export interface TemplatePageAssignmentRepository {
  listByVersionId(versionId: string): Promise<TemplatePageAssignmentRecord[]>;
  replaceForVersion(versionId: string, assignments: TemplatePageAssignmentRecord[]): Promise<void>;
}

export type TemplateRepositories = {
  templates: TemplateRepository;
  versions: TemplateVersionRepository;
  documents: TemplateDocumentRepository;
  roles: TemplateRecipientRoleRepository;
  fields: TemplateFieldRepository;
  pageAssignments: TemplatePageAssignmentRepository;
};

