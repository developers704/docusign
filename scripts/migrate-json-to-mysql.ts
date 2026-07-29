/**
 * One-time: copy JSON data/ files into MySQL.
 * Run on the server (or local if DB is reachable):
 *   npx tsx scripts/migrate-json-to-mysql.ts
 *
 * Requires DATABASE_HOST, DATABASE_USER, DATABASE_PASSWORD, DATABASE_NAME in env.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  mysqlWriteAuditViaPayloads,
  mysqlWriteEnvelopes,
  mysqlWriteOffices,
  mysqlWritePowerForms,
  mysqlWriteSmtpSettings,
  mysqlWriteTemplateFolders,
  mysqlWriteTemplates,
  mysqlWriteUsers,
  mysqlWriteWebForms,
} from "../src/lib/mysqlStore";
import type {
  AuditEvent,
  EnvelopeRecord,
  OfficeRecord,
  PowerFormRecord,
  SmtpSettingsRecord,
  TemplateFolderRecord,
  TemplateRecord,
  UserRecord,
  WebFormRecord,
} from "../src/lib/types";
import { isDatabaseConfigured } from "../src/lib/db";

const dataDir = path.join(process.cwd(), "data");

async function readJson<T>(name: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path.join(dataDir, name), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function main() {
  if (!isDatabaseConfigured()) {
    throw new Error("Set DATABASE_HOST, DATABASE_USER, DATABASE_PASSWORD, DATABASE_NAME first.");
  }

  const offices = await readJson<OfficeRecord[]>("offices.json", []);
  const users = await readJson<UserRecord[]>("users.json", []);
  const folders = await readJson<TemplateFolderRecord[]>("template-folders.json", []);
  const templates = await readJson<TemplateRecord[]>("templates.json", []);
  const envelopes = await readJson<EnvelopeRecord[]>("envelopes.json", []);
  const powerforms = await readJson<PowerFormRecord[]>("powerforms.json", []);
  const webforms = await readJson<WebFormRecord[]>("webforms.json", []);
  const audits = await readJson<AuditEvent[]>("audit-events.json", []);
  const smtp = await readJson<SmtpSettingsRecord | null>("smtp-settings.json", null);

  console.log("Migrating offices…", offices.length);
  await mysqlWriteOffices(offices);
  console.log("Migrating users…", users.length);
  await mysqlWriteUsers(users);
  console.log("Migrating folders…", folders.length);
  await mysqlWriteTemplateFolders(folders);
  console.log("Migrating templates…", templates.length);
  await mysqlWriteTemplates(templates);
  console.log("Migrating envelopes…", envelopes.length);
  await mysqlWriteEnvelopes(envelopes);
  console.log("Migrating powerforms…", powerforms.length);
  await mysqlWritePowerForms(powerforms);
  console.log("Migrating webforms…", webforms.length);
  await mysqlWriteWebForms(webforms);
  console.log("Migrating audit events…", audits.length);
  await mysqlWriteAuditViaPayloads(audits);
  if (smtp?.host && smtp.user && smtp.pass && smtp.from) {
    console.log("Migrating SMTP settings…");
    await mysqlWriteSmtpSettings(smtp);
  }

  console.log("Done. App will use MySQL when DATABASE_* env vars are set.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
