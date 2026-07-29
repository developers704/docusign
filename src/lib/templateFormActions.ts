import type { TemplateRecord } from "@/lib/types";
import type { TemplateRoleDraft } from "@/lib/services/templateService";

const templateVisibilityValues: TemplateRecord["visibility"][] = [
  "private",
  "office",
  "selected_offices",
  "selected_groups",
  "global",
];

function parseCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseRoleDrafts(raw: string): TemplateRoleDraft[] {
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        const row = item as Record<string, unknown>;
        return {
          roleName: String(row.roleName || row.role || "Signer").trim() || "Signer",
          defaultName: String(row.defaultName || row.name || "").trim(),
          defaultEmail: String(row.defaultEmail || row.email || "").trim(),
          action: String(row.action || "").trim() || undefined,
        };
      })
      .filter((item) => item.roleName)
      .slice(0, 100);
  } catch {
    return [];
  }
}

export function parseTemplateFormData(formData: FormData) {
  const officeId = String(formData.get("officeId") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const message = String(formData.get("message") || "").trim();
  const content = String(formData.get("content") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const category = String(formData.get("category") || "").trim();
  const tags = parseCsv(String(formData.get("tags") || "")).slice(0, 20);
  const roleDrafts = parseRoleDrafts(String(formData.get("recipientRoleDefaults") || ""));
  const roleNames = (
    roleDrafts.length
      ? roleDrafts.map((item) => item.roleName)
      : parseCsv(String(formData.get("roleNames") || "Signer"))
  ).slice(0, 100);
  const internalNotes = String(formData.get("internalNotes") || "").trim();
  const selectedOfficeIds = parseCsv(String(formData.get("selectedOfficeIds") || "")).slice(0, 50);
  const selectedGroupIds = parseCsv(String(formData.get("selectedGroupIds") || "")).slice(0, 50);
  const visibilityInput = String(formData.get("visibility") || "office");
  const visibility = templateVisibilityValues.includes(visibilityInput as TemplateRecord["visibility"])
    ? (visibilityInput as TemplateRecord["visibility"])
    : "office";

  return {
    officeId,
    name,
    title,
    message,
    content,
    description,
    category,
    tags,
    roleNames,
    roleDrafts,
    internalNotes,
    selectedOfficeIds,
    selectedGroupIds,
    visibility,
  };
}
