import crypto from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  AuditEvent,
  EnvelopeRecord,
  OfficeRecord,
  PowerFormAccessChallengeRecord,
  PowerFormAnalyticsSnapshot,
  PowerFormRecord,
  PowerFormSubmissionRecord,
  RecipientRecord,
  TemplateFolderRecord,
  TemplateRecord,
  UserRecord,
  UserRole,
  WebFormRecord,
  SmtpSettingsRecord,
  AppNotificationRecord,
  AppProfileRecord,
} from "./types";
import { isDatabaseConfigured } from "./db";
import * as mysqlStore from "./mysqlStore";
import {
  normalizePowerFormAccessChallenge,
  normalizePowerFormAnalytics,
  normalizePowerFormRecord,
  normalizePowerFormSubmission,
} from "./powerFormNormalize";

const DATA_DIRECTORY = path.join(process.cwd(), "data");
const ENVELOPES_FILE = path.join(DATA_DIRECTORY, "envelopes.json");
const AUDIT_FILE = path.join(DATA_DIRECTORY, "audit-events.json");
const TEMPLATES_FILE = path.join(DATA_DIRECTORY, "templates.json");
const OFFICES_FILE = path.join(DATA_DIRECTORY, "offices.json");
const USERS_FILE = path.join(DATA_DIRECTORY, "users.json");
const POWERFORMS_FILE = path.join(DATA_DIRECTORY, "powerforms.json");
const POWERFORM_SUBMISSIONS_FILE = path.join(DATA_DIRECTORY, "powerform-submissions.json");
const POWERFORM_ACCESS_FILE = path.join(DATA_DIRECTORY, "powerform-access.json");
const POWERFORM_ANALYTICS_FILE = path.join(DATA_DIRECTORY, "powerform-analytics.json");
const WEBFORMS_FILE = path.join(DATA_DIRECTORY, "webforms.json");
const TEMPLATE_FOLDERS_FILE = path.join(DATA_DIRECTORY, "template-folders.json");
const SMTP_SETTINGS_FILE = path.join(DATA_DIRECTORY, "smtp-settings.json");
const OFFICE_SMTP_DIR = path.join(DATA_DIRECTORY, "office-smtp");
const LOGIN_OTP_FILE = path.join(DATA_DIRECTORY, "login-otp.json");
const NOTIFICATIONS_FILE = path.join(DATA_DIRECTORY, "notifications.json");
const APP_PROFILE_FILE = path.join(DATA_DIRECTORY, "app-profile.json");

let writeQueue: Promise<void> = Promise.resolve();

async function readArray<T>(filePath: string): Promise<T[]> {
  try {
    const content = await readFile(filePath, "utf8");
    const parsed: unknown = JSON.parse(content);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function atomicWrite(filePath: string, value: unknown) {
  await mkdir(DATA_DIRECTORY, { recursive: true });
  const temporaryFile = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryFile, JSON.stringify(value, null, 2), "utf8");
  await rename(temporaryFile, filePath);
}

function enqueueWrite(operation: () => Promise<void>) {
  writeQueue = writeQueue.then(operation, operation);
  return writeQueue;
}

export async function readOffices(activeOnly = false) {
  if (isDatabaseConfigured()) return mysqlStore.mysqlReadOffices(activeOnly);
  const offices = await readArray<OfficeRecord>(OFFICES_FILE);
  return activeOnly ? offices.filter((office) => office.isActive) : offices;
}

export async function writeOffices(offices: OfficeRecord[]) {
  if (isDatabaseConfigured()) return mysqlStore.mysqlWriteOffices(offices);
  await enqueueWrite(() => atomicWrite(OFFICES_FILE, offices));
}

export async function getOfficeById(id: string | null | undefined) {
  if (!id) return undefined;
  const offices = await readOffices();
  return offices.find((office) => office.id === id);
}

export async function readUsers() {
  if (isDatabaseConfigured()) return mysqlStore.mysqlReadUsers();
  return readArray<UserRecord>(USERS_FILE);
}

export async function writeUsers(users: UserRecord[]) {
  if (isDatabaseConfigured()) return mysqlStore.mysqlWriteUsers(users);
  await enqueueWrite(() => atomicWrite(USERS_FILE, users));
}

export async function getUserById(id: string | null | undefined) {
  if (!id) return undefined;
  const users = await readUsers();
  return users.find((user) => user.id === id);
}

export async function getUsersByOffice(officeId: string) {
  const users = await readUsers();
  return users.filter((user) => user.officeId === officeId);
}

export function createPasswordHash(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const passwordHash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { passwordSalt: salt, passwordHash };
}

export function verifyPassword(password: string, salt: string, expectedHash: string) {
  try {
    const actual = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHash, "hex");
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function slugifyOfficeName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export async function getReservedLoginEmails() {
  const profile = await readAppProfile();
  const emails = new Set<string>();
  const envAdmin = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const profileAdmin = String(profile.adminEmail || "").trim().toLowerCase();
  if (envAdmin) emails.add(envAdmin);
  if (profileAdmin) emails.add(profileAdmin);
  return emails;
}

/** One email = one login account across the whole network. */
export async function assertEmailAvailable(email: string, excludeUserId?: string) {
  const normalized = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(normalized)) {
    throw new Error("Enter a valid email address.");
  }
  const reserved = await getReservedLoginEmails();
  if (reserved.has(normalized)) {
    throw new Error("This email already exists.");
  }
  const users = await readUsers();
  if (users.some((user) => user.id !== excludeUserId && user.email.toLowerCase() === normalized)) {
    throw new Error("This email already exists.");
  }
  return normalized;
}

export async function createOfficeWithAdmin(input: {
  officeName: string;
  slug?: string;
  officeEmail?: string;
  phone?: string;
  address?: string;
  brandColor?: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}) {
  const offices = await readOffices();
  const users = await readUsers();
  const normalizedEmail = await assertEmailAvailable(input.adminEmail);
  // Slug always from office name (create form no longer collects a separate slug).
  const desiredSlug = slugifyOfficeName(input.officeName) || `office-${offices.length + 1}`;
  let slug = desiredSlug;
  let suffix = 2;
  while (offices.some((office) => office.slug === slug)) {
    slug = `${desiredSlug}-${suffix}`;
    suffix += 1;
  }

  const now = new Date().toISOString();
  const officeId = crypto.randomUUID();
  const office: OfficeRecord = {
    id: officeId,
    name: input.officeName.trim(),
    slug,
    email: (input.officeEmail || normalizedEmail).trim(),
    phone: (input.phone || "").trim(),
    address: (input.address || "").trim(),
    brandColor: (input.brandColor || "#21004c").trim() || "#21004c",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  const credentials = createPasswordHash(input.adminPassword);
  const user: UserRecord = {
    id: crypto.randomUUID(),
    officeId,
    name: input.adminName.trim(),
    email: normalizedEmail,
    role: "office_admin",
    passwordSalt: credentials.passwordSalt,
    passwordHash: credentials.passwordHash,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
  };

  offices.push(office);
  users.push(user);
  await writeOffices(offices);
  await writeUsers(users);
  return { office, user };
}

/** Permanently remove an office workspace and its portal data (super admin). */
export async function deleteOfficeWorkspace(officeId: string) {
  const offices = await readOffices();
  const office = offices.find((item) => item.id === officeId);
  if (!office) return { ok: false as const, reason: "Office not found." };

  await writeOffices(offices.filter((item) => item.id !== officeId));

  const users = await readUsers();
  await writeUsers(users.filter((user) => user.officeId !== officeId));

  const envelopes = await readEnvelopes();
  await writeEnvelopes(envelopes.filter((envelope) => envelope.officeId !== officeId));

  const templates = await readTemplates();
  await writeTemplates(templates.filter((template) => template.officeId !== officeId));

  const folders = await readTemplateFolders();
  await writeTemplateFolders(folders.filter((folder) => folder.officeId !== officeId));

  const powerForms = await readPowerForms();
  await writePowerForms(powerForms.filter((form) => form.officeId !== officeId));

  const webForms = await readWebForms();
  await writeWebForms(webForms.filter((form) => form.officeId !== officeId));

  const notifications = await readNotifications();
  await writeNotifications(notifications.filter((item) => item.officeId !== officeId));

  if (isDatabaseConfigured()) {
    const events = await mysqlStore.mysqlReadAuditEvents();
    await mysqlStore.mysqlWriteAuditViaPayloads(events.filter((event) => event.officeId !== officeId));
  } else {
    const events = await readArray<AuditEvent>(AUDIT_FILE);
    await enqueueWrite(() =>
      atomicWrite(
        AUDIT_FILE,
        events.filter((event) => event.officeId !== officeId)
      )
    );
  }

  try {
    const { rm } = await import("node:fs/promises");
    await rm(path.join(process.cwd(), "storage", "offices", officeId), { recursive: true, force: true });
  } catch {
    // Storage cleanup is best-effort.
  }

  try {
    const { unlink } = await import("node:fs/promises");
    await unlink(path.join(OFFICE_SMTP_DIR, `${officeId}.json`));
  } catch {
    // Office SMTP file may not exist.
  }

  return { ok: true as const, office };
}

export async function createOfficeUser(input: {
  officeId: string;
  name: string;
  email: string;
  password: string;
  role: UserRecord["role"];
}) {
  const office = await getOfficeById(input.officeId);
  if (!office) throw new Error("Office not found.");
  const users = await readUsers();
  const email = await assertEmailAvailable(input.email);
  const now = new Date().toISOString();
  const credentials = createPasswordHash(input.password);
  const user: UserRecord = {
    id: crypto.randomUUID(),
    officeId: input.officeId,
    name: input.name.trim(),
    email,
    role: input.role,
    passwordSalt: credentials.passwordSalt,
    passwordHash: credentials.passwordHash,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
  };
  users.push(user);
  await writeUsers(users);
  return user;
}

export async function updateUserPassword(userId: string, password: string) {
  const users = await readUsers();
  const user = users.find((item) => item.id === userId);
  if (!user) throw new Error("Portal account not found.");
  const credentials = createPasswordHash(password);
  user.passwordSalt = credentials.passwordSalt;
  user.passwordHash = credentials.passwordHash;
  user.updatedAt = new Date().toISOString();
  await writeUsers(users);
}

export async function updateUserName(userId: string, name: string) {
  const users = await readUsers();
  const user = users.find((item) => item.id === userId);
  if (!user) throw new Error("Portal account not found.");
  const next = name.trim();
  if (!next) throw new Error("Name is required.");
  user.name = next.slice(0, 120);
  user.updatedAt = new Date().toISOString();
  await writeUsers(users);
  return user;
}

export async function updateUserEmail(userId: string, email: string) {
  const users = await readUsers();
  const user = users.find((item) => item.id === userId);
  if (!user) throw new Error("Portal account not found.");
  const normalized = await assertEmailAvailable(email, userId);
  user.email = normalized;
  user.updatedAt = new Date().toISOString();
  await writeUsers(users);
  return user;
}

export async function readAppProfile(): Promise<AppProfileRecord> {
  const fallback: AppProfileRecord = {
    adminName: process.env.ADMIN_NAME || "Network Administrator",
    networkName: process.env.NETWORK_NAME || "Valliani Network",
    masterLoginOtpEnabled: true,
    updatedAt: "",
  };
  try {
    const content = (await readFile(APP_PROFILE_FILE, "utf8")).replace(/^\uFEFF/, "").trim();
    if (!content) return fallback;
    let parsed: Partial<AppProfileRecord>;
    try {
      parsed = JSON.parse(content) as Partial<AppProfileRecord>;
    } catch {
      console.error("[app-profile] invalid JSON, using env/fallback");
      return fallback;
    }
    if (!parsed || typeof parsed !== "object") return fallback;
    return {
      adminName: String(parsed.adminName || fallback.adminName).trim() || fallback.adminName,
      networkName: String(parsed.networkName || fallback.networkName).trim() || fallback.networkName,
      adminEmail: parsed.adminEmail ? String(parsed.adminEmail).trim().toLowerCase() : undefined,
      adminPasswordSalt: parsed.adminPasswordSalt ? String(parsed.adminPasswordSalt) : undefined,
      adminPasswordHash: parsed.adminPasswordHash ? String(parsed.adminPasswordHash) : undefined,
      // Missing / undefined => enabled (secure default for older deployments).
      masterLoginOtpEnabled: parsed.masterLoginOtpEnabled === false ? false : true,
      updatedAt: String(parsed.updatedAt || ""),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    console.error("[app-profile] read failed:", error);
    return fallback;
  }
}

export async function writeAppProfile(profile: AppProfileRecord) {
  await enqueueWrite(() => atomicWrite(APP_PROFILE_FILE, profile));
}

/** Missing value on older deployments must be treated as enabled. */
export function isMasterLoginOtpEnabled(profile: { masterLoginOtpEnabled?: boolean } | null | undefined) {
  return profile?.masterLoginOtpEnabled !== false;
}

export async function authenticatePortalUser(email: string, password: string) {
  const users = await readUsers();
  const user = users.find((item) => item.email.toLowerCase() === email.trim().toLowerCase());
  if (!user || !user.isActive || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
    return undefined;
  }
  const office = await getOfficeById(user.officeId);
  if (!office || !office.isActive) return undefined;
  user.lastLoginAt = new Date().toISOString();
  user.updatedAt = user.lastLoginAt;
  await writeUsers(users);
  return { user, office };
}

export async function readEnvelopes(officeId?: string | null) {
  if (isDatabaseConfigured()) return mysqlStore.mysqlReadEnvelopes(officeId);
  const raw = await readArray<EnvelopeRecord>(ENVELOPES_FILE);
  const envelopes = raw.map((envelope) => normalizeEnvelopeRecord(envelope));
  return officeId ? envelopes.filter((envelope) => envelope.officeId === officeId) : envelopes;
}

export async function writeEnvelopes(envelopes: EnvelopeRecord[]) {
  if (isDatabaseConfigured()) return mysqlStore.mysqlWriteEnvelopes(envelopes);
  await enqueueWrite(() => atomicWrite(ENVELOPES_FILE, envelopes));
}

export async function getEnvelopeById(id: string, officeId?: string | null) {
  const envelopes = await readEnvelopes(officeId);
  return envelopes.find((envelope) => envelope.id === id);
}

/** Decode once if the URL/%-encoded link was double-safe-encoded; never throws. */
export function normalizeSigningToken(token: string) {
  const raw = String(token || "").trim();
  if (!raw) return raw;
  try {
    const decoded = decodeURIComponent(raw);
    return decoded || raw;
  } catch {
    return raw;
  }
}

export async function findEnvelopeByToken(token: string) {
  const normalized = normalizeSigningToken(token);
  if (isDatabaseConfigured()) return mysqlStore.mysqlFindEnvelopeByToken(normalized);
  const tokenHash = hashToken(normalized);
  const envelopes = await readEnvelopes();

  for (let envelopeIndex = 0; envelopeIndex < envelopes.length; envelopeIndex += 1) {
    const recipientIndex = envelopes[envelopeIndex].recipients.findIndex((recipient) => {
      const hashMatch = Boolean(recipient.tokenHash && recipient.tokenHash === tokenHash);
      const legacyMatch = Boolean(recipient.signingToken && recipient.signingToken === normalized);
      return hashMatch || legacyMatch;
    });

    if (recipientIndex >= 0) {
      return {
        envelopes,
        envelopeIndex,
        recipientIndex,
        envelope: envelopes[envelopeIndex],
        recipient: envelopes[envelopeIndex].recipients[recipientIndex],
      };
    }
  }

  return undefined;
}

export async function addAuditEvent(
  event: Omit<AuditEvent, "id" | "createdAt">
) {
  const record: AuditEvent = {
    ...event,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  if (isDatabaseConfigured()) {
    await mysqlStore.mysqlAddAuditEvent(record);
    return record;
  }
  const events = await readAuditEvents();
  events.push(record);
  await enqueueWrite(() => atomicWrite(AUDIT_FILE, events));
  return record;
}

export async function readAuditEvents(envelopeId?: string, officeId?: string | null) {
  if (isDatabaseConfigured()) return mysqlStore.mysqlReadAuditEvents(envelopeId, officeId);
  const events = await readArray<AuditEvent>(AUDIT_FILE);
  return events.filter((event) => {
    if (envelopeId && event.envelopeId !== envelopeId) return false;
    if (officeId && event.officeId !== officeId) return false;
    return true;
  });
}

function normalizeTemplateRecord(template: TemplateRecord): TemplateRecord {
  return {
    ...template,
    schemaVersion: template.schemaVersion || 2,
    sourceType: template.sourceType || "policy_text",
    status: template.status || "draft",
    visibility: template.visibility || "office",
    category: template.category || "",
    tags: Array.isArray(template.tags) ? template.tags : [],
    description: template.description || "",
    internalNotes: template.internalNotes || "",
    selectedOfficeIds: Array.isArray(template.selectedOfficeIds) ? template.selectedOfficeIds : [],
    selectedGroupIds: Array.isArray(template.selectedGroupIds) ? template.selectedGroupIds : [],
    publishedAt: template.publishedAt || null,
    archivedAt: template.archivedAt || null,
    recipientRoles: Array.isArray(template.recipientRoles) ? template.recipientRoles : [],
    fields: Array.isArray(template.fields) ? template.fields : [],
    pageAssignments: Array.isArray(template.pageAssignments) ? template.pageAssignments : [],
    documents: Array.isArray(template.documents) ? template.documents : [],
    versions: Array.isArray(template.versions) ? template.versions : [],
    usageCount: typeof template.usageCount === "number" ? template.usageCount : 0,
    currentVersionId: template.currentVersionId || null,
    ownerUserId: template.ownerUserId || null,
    folderIds: Array.isArray(template.folderIds) ? template.folderIds : [],
    matchingEligible: template.matchingEligible !== false,
  };
}

/**
 * Templates are owned by TemplateService → data/templates.json.
 * Always read/write that file (even when MySQL is configured) so upload/preview/create stay in sync.
 * MySQL is updated as a best-effort mirror for legacy readers.
 */
export async function readTemplates(officeId?: string | null) {
  const templates = (await readArray<TemplateRecord>(TEMPLATES_FILE)).map(normalizeTemplateRecord);
  return officeId ? templates.filter((template) => template.officeId === officeId) : templates;
}

export async function writeTemplates(templates: TemplateRecord[]) {
  const normalized = templates.map(normalizeTemplateRecord);
  await enqueueWrite(() => atomicWrite(TEMPLATES_FILE, normalized));
  if (isDatabaseConfigured()) {
    try {
      await mysqlStore.mysqlWriteTemplates(normalized);
    } catch (error) {
      console.error("[templates] MySQL mirror write failed:", error);
    }
  }
}

export async function readPowerForms(officeId?: string | null) {
  if (isDatabaseConfigured()) {
    const forms = await mysqlStore.mysqlReadPowerForms(officeId);
    return forms.map((form) => normalizePowerFormRecord(form));
  }
  const forms = (await readArray<PowerFormRecord>(POWERFORMS_FILE)).map((form) => normalizePowerFormRecord(form));
  return officeId ? forms.filter((form) => form.officeId === officeId) : forms;
}

export async function writePowerForms(forms: PowerFormRecord[]) {
  const normalized = forms.map((form) => normalizePowerFormRecord(form));
  if (isDatabaseConfigured()) return mysqlStore.mysqlWritePowerForms(normalized);
  await enqueueWrite(() => atomicWrite(POWERFORMS_FILE, normalized));
}

export async function readPowerFormSubmissions(powerFormId?: string | null) {
  const rows = (await readArray<PowerFormSubmissionRecord>(POWERFORM_SUBMISSIONS_FILE)).map((row) =>
    normalizePowerFormSubmission(row)
  );
  return powerFormId ? rows.filter((row) => row.powerFormId === powerFormId) : rows;
}

export async function writePowerFormSubmissions(rows: PowerFormSubmissionRecord[]) {
  const normalized = rows.map((row) => normalizePowerFormSubmission(row));
  await enqueueWrite(() => atomicWrite(POWERFORM_SUBMISSIONS_FILE, normalized));
}

export async function readPowerFormAccessChallenges(powerFormId?: string | null) {
  const rows = (await readArray<PowerFormAccessChallengeRecord>(POWERFORM_ACCESS_FILE)).map((row) =>
    normalizePowerFormAccessChallenge(row)
  );
  return powerFormId ? rows.filter((row) => row.powerFormId === powerFormId) : rows;
}

export async function writePowerFormAccessChallenges(rows: PowerFormAccessChallengeRecord[]) {
  const normalized = rows.map((row) => normalizePowerFormAccessChallenge(row));
  await enqueueWrite(() => atomicWrite(POWERFORM_ACCESS_FILE, normalized));
}

export async function readPowerFormAnalytics() {
  return (await readArray<PowerFormAnalyticsSnapshot>(POWERFORM_ANALYTICS_FILE)).map((row) =>
    normalizePowerFormAnalytics(row)
  );
}

export async function writePowerFormAnalytics(rows: PowerFormAnalyticsSnapshot[]) {
  const normalized = rows.map((row) => normalizePowerFormAnalytics(row));
  await enqueueWrite(() => atomicWrite(POWERFORM_ANALYTICS_FILE, normalized));
}

export async function readWebForms(officeId?: string | null) {
  if (isDatabaseConfigured()) return mysqlStore.mysqlReadWebForms(officeId);
  const forms = await readArray<WebFormRecord>(WEBFORMS_FILE);
  return officeId ? forms.filter((form) => form.officeId === officeId) : forms;
}

export async function writeWebForms(forms: WebFormRecord[]) {
  if (isDatabaseConfigured()) return mysqlStore.mysqlWriteWebForms(forms);
  await enqueueWrite(() => atomicWrite(WEBFORMS_FILE, forms));
}

export async function readTemplateFolders(officeId?: string | null) {
  if (isDatabaseConfigured()) return mysqlStore.mysqlReadTemplateFolders(officeId);
  const folders = await readArray<TemplateFolderRecord>(TEMPLATE_FOLDERS_FILE);
  return officeId ? folders.filter((folder) => folder.officeId === officeId) : folders;
}

export async function writeTemplateFolders(folders: TemplateFolderRecord[]) {
  if (isDatabaseConfigured()) return mysqlStore.mysqlWriteTemplateFolders(folders);
  await enqueueWrite(() => atomicWrite(TEMPLATE_FOLDERS_FILE, folders));
}

function normalizeSmtpRecord(parsed: Partial<SmtpSettingsRecord>): SmtpSettingsRecord | null {
  const host = String(parsed.host || "").trim();
  const user = String(parsed.user || "").trim();
  const pass = String(parsed.pass || "");
  const from = String(parsed.from || "").trim();
  if (!host || !user || !pass || !from) return null;
  const port = Number(parsed.port) || 465;
  return {
    provider: parsed.provider === "gmail" || host.toLowerCase().includes("gmail.com") ? "gmail" : "custom",
    host,
    port,
    secure: port === 587 || port === 2525 || port === 25 ? false : parsed.secure !== false,
    user,
    pass,
    from,
    fromName: String(parsed.fromName || "").trim() || undefined,
    updatedAt: String(parsed.updatedAt || ""),
  };
}

async function readSmtpFromJsonFile(): Promise<SmtpSettingsRecord | null> {
  try {
    const content = await readFile(SMTP_SETTINGS_FILE, "utf8");
    const parsed = JSON.parse(content) as Partial<SmtpSettingsRecord>;
    if (!parsed || typeof parsed !== "object") return null;
    return normalizeSmtpRecord(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    console.error("[smtp] JSON read failed:", error);
    return null;
  }
}

/**
 * SMTP settings: prefer JSON file (same as local) so cPanel MySQL schema/permission
 * issues cannot block saving the password the user typed.
 */
export async function readSmtpSettings(): Promise<SmtpSettingsRecord | null> {
  const fromFile = await readSmtpFromJsonFile();
  if (fromFile) return fromFile;

  if (isDatabaseConfigured()) {
    try {
      const fromDb = await mysqlStore.mysqlReadSmtpSettings();
      if (fromDb?.host && fromDb.user && fromDb.pass && fromDb.from) {
        return normalizeSmtpRecord(fromDb);
      }
    } catch (error) {
      console.error("[smtp] MySQL read failed:", error);
    }
  }
  return null;
}

/** Returns raw saved SMTP row even if incomplete (for Settings form defaults). */
export async function readSmtpSettingsDraft(): Promise<Partial<SmtpSettingsRecord> | null> {
  const full = await readSmtpSettings();
  if (full) return full;
  try {
    const content = await readFile(SMTP_SETTINGS_FILE, "utf8");
    const parsed = JSON.parse(content) as Partial<SmtpSettingsRecord>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeSmtpSettings(settings: SmtpSettingsRecord) {
  let jsonOk = false;
  let mysqlOk = false;

  try {
    await enqueueWrite(() => atomicWrite(SMTP_SETTINGS_FILE, settings));
    jsonOk = true;
  } catch (error) {
    console.error("[smtp] JSON write failed:", error);
  }

  if (isDatabaseConfigured()) {
    try {
      await mysqlStore.mysqlWriteSmtpSettings(settings);
      mysqlOk = true;
    } catch (error) {
      console.error("[smtp] MySQL write failed (JSON still used if saved):", error);
    }
  }

  if (!jsonOk && !mysqlOk) {
    throw new Error(
      "Could not write SMTP settings. On cPanel run: mkdir -p ~/company-esign/data && chmod 755 ~/company-esign/data"
    );
  }
}

function officeSmtpFile(officeId: string) {
  return path.join(OFFICE_SMTP_DIR, `${officeId}.json`);
}

/** Per-office SMTP (used for outbound mail from that portal). Falls back to global when unset. */
export async function readOfficeSmtpSettings(officeId: string): Promise<SmtpSettingsRecord | null> {
  if (!officeId) return null;
  try {
    const content = await readFile(officeSmtpFile(officeId), "utf8");
    const parsed = JSON.parse(content) as Partial<SmtpSettingsRecord>;
    if (!parsed || typeof parsed !== "object") return null;
    return normalizeSmtpRecord(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    console.error("[smtp] office JSON read failed:", officeId, error);
    return null;
  }
}

export async function readOfficeSmtpSettingsDraft(officeId: string): Promise<Partial<SmtpSettingsRecord> | null> {
  const full = await readOfficeSmtpSettings(officeId);
  if (full) return full;
  try {
    const content = await readFile(officeSmtpFile(officeId), "utf8");
    const parsed = JSON.parse(content) as Partial<SmtpSettingsRecord>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeOfficeSmtpSettings(officeId: string, settings: SmtpSettingsRecord) {
  if (!officeId) throw new Error("Office id is required.");
  await mkdir(OFFICE_SMTP_DIR, { recursive: true });
  await enqueueWrite(() => atomicWrite(officeSmtpFile(officeId), settings));
}

export type LoginOtpChallenge = {
  id: string;
  email: string;
  pendingSession: {
    userId: string;
    email: string;
    name: string;
    role: UserRole;
    officeId: string | null;
  };
  otpHash: string;
  expiresAt: string;
  remember: boolean;
  attemptCount: number;
  createdAt: string;
  /** When true, OTP was sent to admin security email (master-password login). */
  masterLogin?: boolean;
};

async function readLoginOtpChallenges(): Promise<LoginOtpChallenge[]> {
  try {
    const content = await readFile(LOGIN_OTP_FILE, "utf8");
    const parsed = JSON.parse(content) as LoginOtpChallenge[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLoginOtpChallenges(challenges: LoginOtpChallenge[]) {
  await enqueueWrite(() => atomicWrite(LOGIN_OTP_FILE, challenges));
}

export async function createLoginOtpChallenge(input: {
  pendingSession: LoginOtpChallenge["pendingSession"];
  remember: boolean;
  otp: string;
  ttlMinutes?: number;
  masterLogin?: boolean;
}): Promise<LoginOtpChallenge> {
  const now = Date.now();
  const ttl = (input.ttlMinutes ?? 10) * 60 * 1000;
  const challenges = (await readLoginOtpChallenges()).filter(
    (item) => new Date(item.expiresAt).getTime() > now
  );
  const challenge: LoginOtpChallenge = {
    id: crypto.randomUUID(),
    email: input.pendingSession.email,
    pendingSession: input.pendingSession,
    otpHash: hashToken(input.otp.trim().toUpperCase()),
    expiresAt: new Date(now + ttl).toISOString(),
    remember: input.remember,
    attemptCount: 0,
    createdAt: new Date(now).toISOString(),
    masterLogin: Boolean(input.masterLogin),
  };
  challenges.push(challenge);
  await writeLoginOtpChallenges(challenges);
  return challenge;
}

export async function verifyLoginOtpChallenge(input: {
  challengeId: string;
  otp: string;
}): Promise<
  | { ok: true; challenge: LoginOtpChallenge }
  | { ok: false; error: string; masterLogin?: boolean }
> {
  const now = Date.now();
  const challenges = await readLoginOtpChallenges();
  const index = challenges.findIndex((item) => item.id === input.challengeId);
  if (index < 0) return { ok: false, error: "Verification code expired. Sign in again." };
  const challenge = challenges[index];
  const masterLogin = Boolean(challenge.masterLogin);
  if (new Date(challenge.expiresAt).getTime() <= now) {
    challenges.splice(index, 1);
    await writeLoginOtpChallenges(challenges);
    return { ok: false, error: "Verification code expired. Sign in again.", masterLogin };
  }
  if (challenge.attemptCount >= 5) {
    challenges.splice(index, 1);
    await writeLoginOtpChallenges(challenges);
    return { ok: false, error: "Too many attempts. Sign in again.", masterLogin };
  }
  if (!timingSafeHashEqual(challenge.otpHash, hashToken(input.otp.trim().toUpperCase()))) {
    challenge.attemptCount += 1;
    challenges[index] = challenge;
    await writeLoginOtpChallenges(challenges);
    return { ok: false, error: "Incorrect verification code.", masterLogin };
  }
  challenges.splice(index, 1);
  await writeLoginOtpChallenges(challenges.filter((item) => new Date(item.expiresAt).getTime() > now));
  return { ok: true, challenge };
}

function timingSafeHashEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function hashToken(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function createSecureToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function createSigningTokenPayload(input: { recipientId: string; tokenVersion: number }) {
  const nonce = createSecureToken();
  return `${input.recipientId}.${input.tokenVersion}.${nonce}`;
}

export function createEnvelopeNumber(officeSlug?: string) {
  const date = new Date();
  const datePart = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
  const officePart = officeSlug ? officeSlug.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase() : "ENV";
  return `${officePart}-${datePart}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

export function getClientIpAddress(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function isEnvelopeExpired(envelope: EnvelopeRecord) {
  if (!envelope.expiresAt) return false;
  return Date.now() > new Date(envelope.expiresAt).getTime();
}

export function getCurrentRecipient(envelope: EnvelopeRecord) {
  const actionable = [...envelope.recipients]
    .filter((recipient) => !["receives_copy", "view_only"].includes(recipient.recipientType || "signer"))
    .sort((a, b) => (a.signingStep || a.order) - (b.signingStep || b.order));
  if (envelope.workflowType === "parallel") {
    return actionable.find((recipient) => ["active", "sent", "viewed", "verified", "pending"].includes(recipient.status));
  }
  const currentStep = Math.min(...actionable.filter((recipient) => !isRecipientCompleted(recipient)).map((recipient) => recipient.signingStep || recipient.order));
  if (!Number.isFinite(currentStep)) return undefined;
  return actionable.find((recipient) => (recipient.signingStep || recipient.order) === currentStep && !isRecipientCompleted(recipient));
}

export function isRecipientCompleted(recipient: RecipientRecord) {
  return ["signed", "approved", "acknowledged", "completed"].includes(recipient.status);
}

function normalizeEnvelopeRecord(input: EnvelopeRecord): EnvelopeRecord {
  const recipients = (Array.isArray(input.recipients) ? input.recipients : []).map((recipient, index) =>
    normalizeRecipientRecord(recipient, input.id, index + 1)
  );
  const workflowType = input.workflowType || "sequential";
  const normalized: EnvelopeRecord = {
    ...input,
    schemaVersion: input.schemaVersion || 2,
    workflowType,
    declineBehavior: input.declineBehavior || "stop_envelope",
    expiresAt: input.expiresAt || null,
    scheduledSendAt: input.scheduledSendAt || null,
    scheduledTimezone: input.scheduledTimezone || null,
    templateId: input.templateId || null,
    templateVersionId: input.templateVersionId || null,
    recipients,
    fields: Array.isArray(input.fields) ? input.fields : [],
    pageAssignments: Array.isArray(input.pageAssignments) ? input.pageAssignments : [],
  };

  if (!input.workflowType) {
    normalized.updatedAt = input.updatedAt || new Date().toISOString();
  }
  return normalized;
}

const MAX_NOTIFICATIONS = 300;

export async function readNotifications(): Promise<AppNotificationRecord[]> {
  return readArray<AppNotificationRecord>(NOTIFICATIONS_FILE);
}

export async function writeNotifications(notifications: AppNotificationRecord[]) {
  await enqueueWrite(() => atomicWrite(NOTIFICATIONS_FILE, notifications.slice(0, MAX_NOTIFICATIONS)));
}

export async function createAppNotification(input: {
  officeId: string;
  envelopeId?: string | null;
  type: AppNotificationRecord["type"];
  title: string;
  message: string;
  href?: string | null;
}) {
  try {
    const notifications = await readNotifications();
    const item: AppNotificationRecord = {
      id: crypto.randomUUID(),
      officeId: input.officeId,
      envelopeId: input.envelopeId || null,
      type: input.type,
      title: input.title,
      message: input.message,
      href: input.href ?? (input.envelopeId ? `/open/envelope/${input.envelopeId}` : "/agreements"),
      createdAt: new Date().toISOString(),
      readBy: [],
    };
    notifications.unshift(item);
    await writeNotifications(notifications);
    return item;
  } catch (error) {
    // ponytail: never block signing/viewing if notifications.json is not writable on the VM
    console.error("createAppNotification failed:", error);
    return null;
  }
}

export async function listNotificationsForSession(input: {
  userId: string;
  role: string;
  officeId: string | null;
  limit?: number;
  /** When true (default), only return notifications the user has not read yet. */
  unreadOnly?: boolean;
}) {
  const limit = input.limit ?? 40;
  const unreadOnly = input.unreadOnly !== false;
  const all = await readNotifications();
  const scoped =
    input.role === "super_admin"
      ? all
      : all.filter((item) => item.officeId === input.officeId);
  const mapped = scoped.map((item) => {
    const href =
      item.href ||
      (item.envelopeId ? `/open/envelope/${item.envelopeId}` : "/agreements");
    // Migrate legacy /envelopes/:id links through the safe open route.
    const safeHref = href.startsWith("/envelopes/")
      ? `/open/envelope/${href.slice("/envelopes/".length).split("?")[0]}`
      : href;
    return {
      ...item,
      href: safeHref,
      unread: !item.readBy.includes(input.userId),
    };
  });
  const filtered = unreadOnly ? mapped.filter((item) => item.unread) : mapped;
  return filtered.slice(0, limit).map((item) => ({
    id: item.id,
    title: item.title,
    message: item.message,
    href: item.href,
    envelopeId: item.envelopeId,
    createdAt: item.createdAt,
    unread: item.unread,
    type: item.type,
  }));
}

export async function markNotificationsRead(input: {
  userId: string;
  role: string;
  officeId: string | null;
  ids?: string[] | "all";
}) {
  const notifications = await readNotifications();
  let changed = false;
  for (const item of notifications) {
    if (input.role !== "super_admin" && item.officeId !== input.officeId) continue;
    const shouldMark =
      input.ids === "all" || (Array.isArray(input.ids) && input.ids.includes(item.id));
    if (!shouldMark) continue;
    if (!item.readBy.includes(input.userId)) {
      item.readBy.push(input.userId);
      changed = true;
    }
  }
  if (changed) await writeNotifications(notifications);
  return changed;
}

function normalizeRecipientRecord(input: RecipientRecord, envelopeId: string, fallbackOrder: number): RecipientRecord {
  return {
    ...input,
    envelopeId: input.envelopeId || envelopeId,
    templateRoleId: input.templateRoleId || null,
    phone: input.phone || null,
    recipientType: input.recipientType || "signer",
    authenticationMethod: input.authenticationMethod || "none",
    order: Number.isFinite(input.order) ? input.order : fallbackOrder,
    signingStep: Number.isFinite(input.signingStep) ? input.signingStep : Number.isFinite(input.order) ? input.order : fallbackOrder,
    stepGroup: input.stepGroup || null,
    isRequired: input.isRequired !== false,
    activatedAt: input.activatedAt || null,
    completedAt: input.completedAt || null,
    approvedAt: input.approvedAt || null,
    acknowledgedAt: input.acknowledgedAt || null,
    tokenVersion: Number.isFinite(input.tokenVersion) ? Number(input.tokenVersion) : 1,
    tokenRevokedAt: input.tokenRevokedAt || null,
    tokenExpiresAt: input.tokenExpiresAt || null,
    otpAttemptCount: Number.isFinite(input.otpAttemptCount) ? Number(input.otpAttemptCount) : 0,
    otpLockedUntil: input.otpLockedUntil || null,
    otpLastSentAt: input.otpLastSentAt || null,
    reminderCount: Number.isFinite(input.reminderCount) ? Number(input.reminderCount) : 0,
    metadata: input.metadata || {},
  };
}
