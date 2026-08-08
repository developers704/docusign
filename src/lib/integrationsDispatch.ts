import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { EnvelopeRecord } from "@/lib/types";
import {
  integrationsScopeId,
  readIntegrations,
  type OfficeIntegrationsRecord,
  type WebhookEvent,
} from "@/lib/integrationsStore";

async function postWebhook(
  config: NonNullable<OfficeIntegrationsRecord["webhooks"]>,
  event: WebhookEvent,
  payload: Record<string, unknown>
) {
  if (!config.enabled || !config.url) return { sent: false, reason: "Webhooks not enabled." };
  if (config.events.length && !config.events.includes(event)) {
    return { sent: false, reason: "Event not subscribed." };
  }
  const body = JSON.stringify({
    event,
    sentAt: new Date().toISOString(),
    data: payload,
  });
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Valliani-Contracts-Webhooks/1.0",
    "X-Valliani-Event": event,
  };
  if (config.secret) {
    headers["X-Valliani-Signature"] = createHmac("sha256", config.secret).update(body).digest("hex");
  }
  const response = await fetch(config.url, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    return { sent: false, reason: `Webhook HTTP ${response.status}` };
  }
  return { sent: true };
}

async function uploadDropbox(token: string, folder: string, filename: string, bytes: Buffer) {
  const dest = `${(folder || "/Contracts").replace(/\/$/, "")}/${filename}`;
  const response = await fetch("https://content.dropboxapi.com/2/files/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({
        path: dest.startsWith("/") ? dest : `/${dest}`,
        mode: "add",
        autorename: true,
        mute: false,
      }),
    },
    body: new Uint8Array(bytes),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Dropbox upload failed (${response.status}): ${text.slice(0, 180)}`);
  }
  return { provider: "dropbox" as const, path: dest };
}

async function uploadGoogleDrive(token: string, folderId: string, filename: string, bytes: Buffer) {
  const metadata = {
    name: filename,
    parents: folderId ? [folderId] : undefined,
  };
  const boundary = `valliani_${Date.now()}`;
  const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const fileHeader = `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`;
  const closing = `\r\n--${boundary}--`;
  const body = Buffer.concat([
    Buffer.from(metaPart, "utf8"),
    Buffer.from(fileHeader, "utf8"),
    bytes,
    Buffer.from(closing, "utf8"),
  ]);
  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Google Drive upload failed (${response.status}): ${text.slice(0, 180)}`);
  }
  return { provider: "google_drive" as const, path: folderId || "root" };
}

async function uploadOneDrive(token: string, folder: string, filename: string, bytes: Buffer) {
  const cleanFolder = (folder || "Contracts").replace(/^\/+|\/+$/g, "");
  const encodedName = encodeURIComponent(filename);
  const url = cleanFolder
    ? `https://graph.microsoft.com/v1.0/me/drive/root:/${cleanFolder}/${encodedName}:/content`
    : `https://graph.microsoft.com/v1.0/me/drive/root:/${encodedName}:/content`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/pdf",
    },
    body: new Uint8Array(bytes),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OneDrive upload failed (${response.status}): ${text.slice(0, 180)}`);
  }
  return { provider: "onedrive" as const, path: cleanFolder || "root" };
}

async function loadSignedPdf(envelope: EnvelopeRecord) {
  if (!envelope.signedPdfPath) return null;
  try {
    return await readFile(path.join(process.cwd(), envelope.signedPdfPath));
  } catch {
    return null;
  }
}

/** Fire webhooks + archive to connected cloud storage (best-effort). */
export async function dispatchEnvelopeIntegrations(input: {
  officeId: string;
  event: WebhookEvent;
  envelope: EnvelopeRecord;
  extra?: Record<string, unknown>;
}) {
  const scopeId = integrationsScopeId(input.officeId);
  const config = await readIntegrations(scopeId);
  const results: Array<{ kind: string; ok: boolean; detail?: string }> = [];

  if (config.webhooks?.enabled) {
    try {
      const result = await postWebhook(config.webhooks, input.event, {
        envelopeId: input.envelope.id,
        envelopeNumber: input.envelope.envelopeNumber,
        title: input.envelope.title,
        status: input.envelope.status,
        officeId: input.envelope.officeId,
        officeName: input.envelope.officeName,
        ...input.extra,
      });
      results.push({ kind: "webhooks", ok: result.sent, detail: result.reason });
    } catch (error) {
      results.push({
        kind: "webhooks",
        ok: false,
        detail: error instanceof Error ? error.message : "Webhook failed",
      });
    }
  }

  if (input.event !== "envelope.completed") {
    return results;
  }

  const pdf = await loadSignedPdf(input.envelope);
  if (!pdf) {
    results.push({ kind: "storage", ok: false, detail: "No signed PDF to archive." });
    return results;
  }

  const filename = `${(input.envelope.title || "contract").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80)}-${input.envelope.envelopeNumber}.pdf`;

  if (config.googleDrive?.enabled && config.googleDrive.accessToken) {
    try {
      const uploaded = await uploadGoogleDrive(
        config.googleDrive.accessToken,
        config.googleDrive.folder,
        filename,
        pdf
      );
      results.push({ kind: "google_drive", ok: true, detail: uploaded.path });
    } catch (error) {
      results.push({
        kind: "google_drive",
        ok: false,
        detail: error instanceof Error ? error.message : "Upload failed",
      });
    }
  }

  if (config.oneDrive?.enabled && config.oneDrive.accessToken) {
    try {
      const uploaded = await uploadOneDrive(config.oneDrive.accessToken, config.oneDrive.folder, filename, pdf);
      results.push({ kind: "onedrive", ok: true, detail: uploaded.path });
    } catch (error) {
      results.push({
        kind: "onedrive",
        ok: false,
        detail: error instanceof Error ? error.message : "Upload failed",
      });
    }
  }

  if (config.dropbox?.enabled && config.dropbox.accessToken) {
    try {
      const uploaded = await uploadDropbox(config.dropbox.accessToken, config.dropbox.folder, filename, pdf);
      results.push({ kind: "dropbox", ok: true, detail: uploaded.path });
    } catch (error) {
      results.push({
        kind: "dropbox",
        ok: false,
        detail: error instanceof Error ? error.message : "Upload failed",
      });
    }
  }

  return results;
}
