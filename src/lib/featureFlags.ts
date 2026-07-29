function envFlag(name: string, defaultValue = false) {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export const featureFlags = {
  phase1TemplateFoundation: envFlag("FF_PHASE1_TEMPLATE_FOUNDATION", true),
  templateAdvancedMetadata: envFlag("FF_TEMPLATE_ADVANCED_METADATA", true),
  templateRoleDesigner: envFlag("FF_TEMPLATE_ROLE_DESIGNER", true),
  templateFieldAndPageAssignment: envFlag("FF_TEMPLATE_FIELD_PAGE_ASSIGNMENT", true),
  templateVersionRestore: envFlag("FF_TEMPLATE_VERSION_RESTORE", true),
  templateVersionCompare: envFlag("FF_TEMPLATE_VERSION_COMPARE", false),
  templateUsageAnalytics: envFlag("FF_TEMPLATE_USAGE_ANALYTICS", false),
  templateSendHistory: envFlag("FF_TEMPLATE_SEND_HISTORY", false),
  templateGroupVisibility: envFlag("FF_TEMPLATE_GROUP_VISIBILITY", false),
};

