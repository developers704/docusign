import type { TemplateFieldRepository } from "@/lib/repositories/templateRepositories";
import type { TemplateFieldRecord } from "@/lib/types";

const RUNTIME_SUPPORTED_FIELDS = new Set(["signature", "initials", "name", "email", "date", "text", "checkbox"]);

export class TemplateFieldService {
  constructor(private readonly fields: TemplateFieldRepository) {}

  async list(versionId: string) {
    return this.fields.listByVersionId(versionId);
  }

  async replace(versionId: string, nextFields: TemplateFieldRecord[]) {
    await this.fields.replaceForVersion(versionId, nextFields);
  }

  getUnsupportedRuntimeFieldTypes(versionFields: TemplateFieldRecord[]) {
    return [...new Set(versionFields.filter((field) => !RUNTIME_SUPPORTED_FIELDS.has(field.type)).map((field) => field.type))];
  }
}

