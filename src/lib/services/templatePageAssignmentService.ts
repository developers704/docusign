import type { TemplatePageAssignmentRepository } from "@/lib/repositories/templateRepositories";
import type { TemplatePageAssignmentRecord } from "@/lib/types";

export class TemplatePageAssignmentService {
  constructor(private readonly assignments: TemplatePageAssignmentRepository) {}

  async list(versionId: string) {
    return this.assignments.listByVersionId(versionId);
  }

  async replace(versionId: string, nextAssignments: TemplatePageAssignmentRecord[]) {
    await this.assignments.replaceForVersion(versionId, nextAssignments);
  }
}

