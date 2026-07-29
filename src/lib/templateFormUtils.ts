import type { TemplateRoleType, TemplateStatus, TemplateVisibility } from "@/lib/types";

export const TEMPLATE_STATUS_LABELS: Record<TemplateStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

export const TEMPLATE_VISIBILITY_LABELS: Record<TemplateVisibility, string> = {
  private: "Only me",
  office: "My office",
  selected_offices: "Selected offices",
  selected_groups: "Selected groups",
  global: "All offices",
};

export const TEMPLATE_ROLE_ACTION_LABELS: Record<TemplateRoleType, string> = {
  signer: "Needs to sign",
  approver: "Needs to approve",
  reviewer: "Needs to review",
  witness: "Witness",
  receives_copy: "Receives a copy",
  view_only: "Needs to view",
  in_person_signer: "In-person signer",
};

export function formatTemplateDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function parseRoleNamesInput(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function joinRoleNames(roles: string[]) {
  return roles.filter(Boolean).join(", ");
}
