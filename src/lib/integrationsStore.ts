import crypto from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIRECTORY = path.join(process.cwd(), "data");
const INTEGRATIONS_DIR = path.join(DATA_DIRECTORY, "integrations");

export type WebhookEvent =
  | "envelope.sent"
  | "envelope.completed"
  | "recipient.signed"
  | "recipient.viewed";

export type StorageIntegration = {
  enabled: boolean;
  accessToken: string;
  /** Drive/OneDrive folder id, or Dropbox folder path e.g. /Contracts */
  folder: string;
  updatedAt: string;
};

export type WebhooksIntegration = {
  enabled: boolean;
  url: string;
  secret: string;
  events: WebhookEvent[];
  updatedAt: string;
};

export type RestApiIntegration = {
  enabled: boolean;
  /** sha256 of full key */
  apiKeyHash: string;
  /** First 8 chars shown in UI */
  apiKeyPrefix: string;
  updatedAt: string;
};

export type OfficeIntegrationsRecord = {
  scopeId: string;
  googleDrive?: StorageIntegration | null;
  oneDrive?: StorageIntegration | null;
  dropbox?: StorageIntegration | null;
  webhooks?: WebhooksIntegration | null;
  restApi?: RestApiIntegration | null;
  updatedAt: string;
};

let writeQueue: Promise<void> = Promise.resolve();

function enqueueWrite(operation: () => Promise<void>) {
  writeQueue = writeQueue.then(operation, operation);
  return writeQueue;
}

async function atomicWrite(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryFile = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryFile, JSON.stringify(value, null, 2), "utf8");
  await rename(temporaryFile, filePath);
}

function fileForScope(scopeId: string) {
  const safe = scopeId.replace(/[^a-zA-Z0-9_-]/g, "_") || "network";
  return path.join(INTEGRATIONS_DIR, `${safe}.json`);
}

export function integrationsScopeId(officeId: string | null | undefined) {
  return officeId?.trim() || "__network__";
}

export async function readIntegrations(scopeId: string): Promise<OfficeIntegrationsRecord> {
  try {
    const content = await readFile(fileForScope(scopeId), "utf8");
    const parsed = JSON.parse(content) as OfficeIntegrationsRecord;
    if (!parsed || typeof parsed !== "object") {
      return { scopeId, updatedAt: "" };
    }
    return { ...parsed, scopeId };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { scopeId, updatedAt: "" };
    }
    throw error;
  }
}

export async function writeIntegrations(record: OfficeIntegrationsRecord) {
  const next = { ...record, updatedAt: new Date().toISOString() };
  await enqueueWrite(() => atomicWrite(fileForScope(record.scopeId), next));
  return next;
}

export function hashApiKey(apiKey: string) {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

export function createApiKey() {
  const apiKey = `vc_${crypto.randomBytes(24).toString("hex")}`;
  return {
    apiKey,
    apiKeyHash: hashApiKey(apiKey),
    apiKeyPrefix: apiKey.slice(0, 11),
  };
}

export async function findIntegrationsByApiKey(apiKey: string) {
  const keyHash = hashApiKey(apiKey);
  try {
    await mkdir(INTEGRATIONS_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
  const { readdir } = await import("node:fs/promises");
  let files: string[] = [];
  try {
    files = await readdir(INTEGRATIONS_DIR);
  } catch {
    return null;
  }
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const content = await readFile(path.join(INTEGRATIONS_DIR, file), "utf8");
      const parsed = JSON.parse(content) as OfficeIntegrationsRecord;
      if (parsed.restApi?.enabled && parsed.restApi.apiKeyHash === keyHash) {
        return parsed;
      }
    } catch {
      /* skip bad files */
    }
  }
  return null;
}

/** Safe public status for the Integrations page (no secrets). */
export function integrationsPublicStatus(record: OfficeIntegrationsRecord) {
  return {
    googleDrive: {
      connected: Boolean(record.googleDrive?.enabled && record.googleDrive.accessToken),
      folder: record.googleDrive?.folder || "",
      updatedAt: record.googleDrive?.updatedAt || "",
    },
    oneDrive: {
      connected: Boolean(record.oneDrive?.enabled && record.oneDrive.accessToken),
      folder: record.oneDrive?.folder || "",
      updatedAt: record.oneDrive?.updatedAt || "",
    },
    dropbox: {
      connected: Boolean(record.dropbox?.enabled && record.dropbox.accessToken),
      folder: record.dropbox?.folder || "",
      updatedAt: record.dropbox?.updatedAt || "",
    },
    webhooks: {
      connected: Boolean(record.webhooks?.enabled && record.webhooks.url),
      url: record.webhooks?.url || "",
      events: record.webhooks?.events || [],
      updatedAt: record.webhooks?.updatedAt || "",
      hasSecret: Boolean(record.webhooks?.secret),
    },
    restApi: {
      connected: Boolean(record.restApi?.enabled && record.restApi.apiKeyHash),
      apiKeyPrefix: record.restApi?.apiKeyPrefix || "",
      updatedAt: record.restApi?.updatedAt || "",
    },
  };
}
