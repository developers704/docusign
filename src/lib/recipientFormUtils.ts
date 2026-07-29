import type { RecipientRecord, RecipientType, TemplateRecipientRoleRecord, WorkflowType } from "@/lib/types";

export type RecipientFormInput = {
  id: string;
  name: string;
  email: string;
  phone: string;
  recipientType: RecipientType;
  signingStep: number;
  required: boolean;
  templateRoleId: string;
  /** Display role label (DocuSign-style), e.g. Signer / Manager. */
  role?: string;
  /** UI action key: needs_to_sign | receives_a_copy | needs_to_view | in_person_signer */
  action?: string;
};

export type AgreementSendMode = "group" | "sequential" | "single";

export function sendModeUsesSigningOrder(mode: AgreementSendMode) {
  return mode === "sequential";
}

export function applySendMode(mode: AgreementSendMode, recipients: RecipientFormInput[]) {
  if (mode === "single") {
    const first = recipients[0] || createRecipient(0);
    return [{ ...first, signingStep: 1 }];
  }
  if (mode === "group") {
    return recipients.map((recipient) => ({ ...recipient, signingStep: 1 }));
  }
  return recipients.map((recipient, index) => ({ ...recipient, signingStep: index + 1 }));
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  // Prefer comma; if none, allow tab or semicolon (Excel / paste variants).
  const separator = line.includes(",") ? "," : line.includes("\t") ? "\t" : line.includes(";") ? ";" : ",";
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === separator && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

export function parseRecipientCsv(text: string, sendMode: "group" | "sequential") {
  const errors: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return { recipients: [] as RecipientFormInput[], errors: ["Add at least one row to import."] };
  }

  const rows: Array<{ name: string; email: string }> = [];
  const firstCells = splitCsvLine(lines[0]).map((cell) => cell.toLowerCase());
  const hasHeader = firstCells.includes("email") || firstCells.includes("name");
  const dataLines = hasHeader ? lines.slice(1) : lines;

  for (const line of dataLines) {
    const cells = splitCsvLine(line).map((cell) => cell.trim());
    const nonEmpty = cells.filter(Boolean);

    if (nonEmpty.length >= 2) {
      // Prefer a cell that looks like an email as the email column
      let emailIndex = nonEmpty.findIndex((cell) => /^\S+@\S+\.\S+$/.test(cell));
      if (emailIndex < 0) emailIndex = nonEmpty.length - 1;
      const email = nonEmpty[emailIndex];
      const name = nonEmpty.filter((_, i) => i !== emailIndex).join(" ").trim() || email.split("@")[0];
      rows.push({ name, email });
      continue;
    }

    const value = nonEmpty[0] || "";
    if (/^\S+@\S+\.\S+$/.test(value)) {
      const local = value.split("@")[0] || "Recipient";
      rows.push({
        name: local.replace(/[._-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
        email: value,
      });
      continue;
    }
    errors.push(`Could not read row: ${line}`);
  }

  if (!rows.length && !errors.length) errors.push("No valid recipients were found in the CSV.");
  if (errors.length) return { recipients: [] as RecipientFormInput[], errors };

  const seen = new Set<string>();
  const recipients = rows.map((row, index) => {
    const email = row.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) errors.push(`Invalid email on row ${index + 1}.`);
    if (seen.has(email)) errors.push(`Duplicate email in CSV: ${email}`);
    seen.add(email);
    return {
      ...createRecipient(index),
      name: row.name.trim() || email.split("@")[0],
      email,
      signingStep: sendMode === "sequential" ? index + 1 : 1,
      action: "needs_to_sign",
      recipientType: "signer" as RecipientType,
    };
  });

  return { recipients, errors: [...new Set(errors)] };
}

export const RECIPIENT_ACTION_OPTIONS: Array<{ label: string; value: RecipientType }> = [
  { label: "Needs to sign", value: "signer" },
  { label: "Needs to approve", value: "approver" },
  { label: "Receives a copy", value: "receives_copy" },
  { label: "Needs to view", value: "view_only" },
  { label: "Witness", value: "witness" },
];

export function recipientActionLabel(type: RecipientType) {
  return RECIPIENT_ACTION_OPTIONS.find((option) => option.value === type)?.label || "Needs to sign";
}

export function defaultRecipientRole(index: number) {
  return `Signer ${index + 1}`;
}

export function roleForSigningStep(step: number) {
  return defaultRecipientRole(Math.max(0, step - 1));
}

export function isAutoSignerRole(role: string | undefined | null) {
  if (!role?.trim()) return true;
  return /^Signer\s+\d+$/i.test(role.trim());
}

export function recipientRoleLabel(
  recipient: Pick<RecipientRecord, "signingStep" | "order" | "metadata">
) {
  const stored = recipient.metadata?.roleLabel;
  if (typeof stored === "string" && stored.trim()) return stored.trim();
  return roleForSigningStep(recipient.signingStep || recipient.order || 1);
}

export function syncAutoSignerRoles(recipients: RecipientFormInput[]): RecipientFormInput[] {
  return recipients.map((recipient) => {
    if (!isAutoSignerRole(recipient.role)) return recipient;
    return { ...recipient, role: roleForSigningStep(recipient.signingStep || 1) };
  });
}

export function syncEnvelopeSignerRoles(recipients: RecipientRecord[]): RecipientRecord[] {
  return recipients.map((recipient) => {
    const step = recipient.signingStep || recipient.order || 1;
    const current = typeof recipient.metadata?.roleLabel === "string" ? recipient.metadata.roleLabel : "";
    if (!isAutoSignerRole(current)) return recipient;
    return {
      ...recipient,
      metadata: { ...(recipient.metadata || {}), roleLabel: roleForSigningStep(step) },
    };
  });
}

export function createRecipient(index: number): RecipientFormInput {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name: "",
    email: "",
    phone: "",
    recipientType: "signer",
    signingStep: index + 1,
    required: true,
    templateRoleId: "",
    role: defaultRecipientRole(index),
    action: "needs_to_sign",
  };
}

export function actionToRecipientType(action: string | undefined): RecipientType {
  if (action === "receives_a_copy") return "receives_copy";
  if (action === "needs_to_view") return "view_only";
  if (action === "in_person_signer") return "in_person_signer";
  return "signer";
}

export function recipientTypeToAction(type: RecipientType): string {
  if (type === "receives_copy") return "receives_a_copy";
  if (type === "view_only") return "needs_to_view";
  if (type === "in_person_signer") return "in_person_signer";
  if (type === "approver") return "needs_to_sign";
  return "needs_to_sign";
}

export const AGREEMENT_RECIPIENT_COLORS = ["#7ec8e3", "#8fd6a8", "#f0c36a", "#c4a5f5", "#f5a8c0"];

export function inferWorkflowType(signingOrderEnabled: boolean, recipients: RecipientFormInput[]): WorkflowType {
  if (!signingOrderEnabled) return "parallel";
  const steps = recipients.map((recipient) => recipient.signingStep);
  const unique = new Set(steps);
  if (unique.size < steps.length) return "grouped";
  return "sequential";
}

export function normalizeRecipientsForSubmit(signingOrderEnabled: boolean, recipients: RecipientFormInput[]) {
  return recipients.map((recipient, index) => {
    const isCopy = recipient.recipientType === "receives_copy";
    const isViewOnly = recipient.recipientType === "view_only";
    return {
      ...recipient,
      signingStep: signingOrderEnabled ? Math.max(1, recipient.signingStep || index + 1) : 1,
      required: isCopy || isViewOnly ? false : recipient.required,
    };
  });
}

export function setRecipientSigningStep(recipients: RecipientFormInput[], id: string, step: number) {
  if (!recipients.length) return recipients;
  const target = Math.max(1, Math.min(recipients.length, Math.floor(step) || 1));
  const current = recipients.find((recipient) => recipient.id === id);
  if (!current) return recipients;
  const oldStep = current.signingStep || 1;
  if (oldStep === target) return recipients;

  return syncAutoSignerRoles(
    recipients.map((recipient) => {
      if (recipient.id === id) return { ...recipient, signingStep: target };
      if (recipient.signingStep === target) return { ...recipient, signingStep: oldStep };
      return recipient;
    })
  );
}

export function reorderRecipientsSequentially(recipients: RecipientFormInput[]) {
  return recipients.map((recipient, index) => ({ ...recipient, signingStep: index + 1 }));
}

function isPassiveRecipient(recipient: Pick<RecipientRecord, "recipientType">) {
  return ["receives_copy", "view_only"].includes(recipient.recipientType || "signer");
}

export function sortEnvelopeRecipients(recipients: RecipientRecord[]) {
  return [...recipients].sort((a, b) => (a.signingStep || a.order) - (b.signingStep || b.order));
}

export function stableEnvelopeSigners(recipients: RecipientRecord[]) {
  return recipients
    .filter((recipient) => !isPassiveRecipient(recipient))
    .sort((a, b) => a.order - b.order);
}

export function splitEnvelopeRecipients(recipients: RecipientRecord[]) {
  const signers = stableEnvelopeSigners(recipients);
  const passive = recipients
    .filter((recipient) => isPassiveRecipient(recipient))
    .sort((a, b) => a.order - b.order);
  return { signers, passive };
}

export function mergeEnvelopeRecipients(signers: RecipientRecord[], passive: RecipientRecord[]) {
  return [...signers, ...passive];
}

export function setEnvelopeRecipientOrder(recipients: RecipientRecord[], id: string, step: number) {
  const { signers, passive } = splitEnvelopeRecipients(recipients);
  if (!signers.length) return recipients;
  const target = Math.max(1, Math.min(signers.length, Math.floor(step) || 1));
  const current = signers.find((recipient) => recipient.id === id);
  if (!current) return recipients;
  const oldStep = current.signingStep || current.order;
  if (oldStep === target) return recipients;

  const updatedSigners = signers.map((recipient) => {
    if (recipient.id === id) return { ...recipient, signingStep: target };
    if ((recipient.signingStep || recipient.order) === target) {
      return { ...recipient, signingStep: oldStep };
    }
    return recipient;
  });
  return syncEnvelopeSignerRoles(mergeEnvelopeRecipients(updatedSigners, passive));
}

export function applyEnvelopeSigningOrder(
  recipients: RecipientRecord[],
  enabled: boolean
): RecipientRecord[] {
  const { signers, passive } = splitEnvelopeRecipients(recipients);
  if (!enabled) {
    return mergeEnvelopeRecipients(
      signers.map((recipient) => ({ ...recipient, signingStep: 1 })),
      passive
    );
  }
  return mergeEnvelopeRecipients(
    signers.map((recipient, index) => ({
      ...recipient,
      signingStep: recipient.signingStep || recipient.order || index + 1,
    })),
    passive
  );
}

export function envelopeRecipientsToForm(recipients: RecipientRecord[]): RecipientFormInput[] {
  return [...recipients]
    .sort((a, b) => a.order - b.order)
    .map((recipient, index) => ({
      id: recipient.id,
      name: recipient.name,
      email: recipient.email,
      phone: recipient.phone || "",
      recipientType: recipient.recipientType || "signer",
      signingStep: recipient.signingStep || recipient.order || index + 1,
      required: recipient.isRequired !== false,
      templateRoleId: recipient.templateRoleId || "",
      role: recipientRoleLabel(recipient),
      action: recipientTypeToAction(recipient.recipientType || "signer"),
    }));
}

export function envelopeHasSigningOrder(signers: RecipientRecord[]) {
  if (signers.length <= 1) return false;
  const steps = signers.map((recipient) => recipient.signingStep || recipient.order || 1);
  return new Set(steps).size > 1;
}

export function envelopeUsesSigningOrder(recipients: RecipientRecord[], workflowType?: WorkflowType) {
  if (workflowType === "parallel") return false;
  if (workflowType === "sequential" || workflowType === "grouped") return true;
  const { signers } = splitEnvelopeRecipients(recipients);
  if (signers.length <= 1) return false;
  const steps = new Set(signers.map((recipient) => recipient.signingStep || recipient.order));
  return steps.size > 1 || signers.some((recipient, index) => (recipient.signingStep || recipient.order) !== index + 1);
}

export function moveRecipientInList(recipients: RecipientFormInput[], id: string, direction: "up" | "down") {
  const index = recipients.findIndex((item) => item.id === id);
  if (index < 0) return recipients;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= recipients.length) return recipients;
  const next = [...recipients];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function swapRecipientsByDrag(recipients: RecipientFormInput[], fromId: string, toId: string) {
  const fromIndex = recipients.findIndex((item) => item.id === fromId);
  const toIndex = recipients.findIndex((item) => item.id === toId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return recipients;
  const next = [...recipients];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function missingRequiredTemplateRoles(
  roles: TemplateRecipientRoleRecord[],
  recipients: RecipientFormInput[]
) {
  const assigned = new Set(recipients.map((recipient) => recipient.templateRoleId).filter(Boolean));
  return roles.filter((role) => role.isRequired && !assigned.has(role.id));
}

export function autoAssignSingleTemplateRoles(
  roles: TemplateRecipientRoleRecord[],
  recipients: RecipientFormInput[]
) {
  if (!roles.length) return recipients;
  const next = recipients.map((recipient) => ({ ...recipient }));
  for (const role of roles) {
    const unassignedCount = next.filter((recipient) => !recipient.templateRoleId).length;
    const alreadyAssigned = next.some((recipient) => recipient.templateRoleId === role.id);
    if (!alreadyAssigned && unassignedCount === 1 && role.isRequired) {
      const target = next.find((recipient) => !recipient.templateRoleId);
      if (target) {
        target.templateRoleId = role.id;
        target.role = role.roleName || target.role || "Signer";
        if (role.defaultName && !target.name.trim()) target.name = role.defaultName;
        if (role.defaultEmail && !target.email.trim()) target.email = role.defaultEmail;
      }
    }
  }
  return next;
}

export function validateRecipientForm(input: {
  recipients: RecipientFormInput[];
  signingOrderEnabled: boolean;
  templateRoles: TemplateRecipientRoleRecord[];
}) {
  const errors: string[] = [];
  const seenEmails = new Set<string>();

  if (!input.recipients.length) {
    errors.push("Add at least one recipient.");
  }

  for (const recipient of input.recipients) {
    if (!recipient.name.trim()) errors.push("Enter the recipient's name.");
    if (!recipient.email.trim() || !/^\S+@\S+\.\S+$/.test(recipient.email.trim())) {
      errors.push("Enter a valid email address.");
    }
    const emailKey = recipient.email.trim().toLowerCase();
    if (emailKey && seenEmails.has(emailKey)) errors.push("Two recipients have the same email address.");
    if (emailKey) seenEmails.add(emailKey);
  }

  const actionable = input.recipients.filter(
    (recipient) => !["receives_copy", "view_only"].includes(recipient.recipientType)
  );
  if (!actionable.length) errors.push("At least one recipient must take an action.");

  if (input.signingOrderEnabled) {
    const steps = input.recipients.map((recipient) => recipient.signingStep).filter((step) => step > 0);
    if (steps.length && Math.min(...steps) !== 1) errors.push("Signing order must begin with 1.");
  }

  for (const role of missingRequiredTemplateRoles(input.templateRoles, input.recipients)) {
    errors.push(`Assign someone to the ${role.roleName} role.`);
  }

  return [...new Set(errors)];
}
