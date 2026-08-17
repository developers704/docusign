import path from "node:path";
import nodemailer from "nodemailer";
import { readOfficeSmtpSettings, readSmtpSettings } from "./store";
import type { SmtpSettingsRecord } from "./types";

type Attachment = {
  filename: string;
  filePath: string;
  contentType?: string;
};

type MailOptions = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  from?: string;
  attachments?: Attachment[];
  /** When set, prefer that office's SMTP; fall back to global / env. */
  officeId?: string | null;
};

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  fromName?: string;
};

type MailResult = {
  sent: boolean;
  reason?: string;
};

const SMTP_TIMEOUT_MS = 45_000;
const START_TLS_PORTS = new Set([25, 587, 2525, 2587]);

function configFromEnv(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM?.trim() || user;

  if (!host || !user || !pass || !from) return null;

  return {
    host,
    port: Number(process.env.SMTP_PORT || "465"),
    secure: (process.env.SMTP_SECURE || "true").toLowerCase() === "true",
    user,
    pass,
    from,
  };
}

function configFromRecord(saved: SmtpSettingsRecord): SmtpConfig {
  const port = Number(saved.port) || 465;
  return {
    host: saved.host,
    port,
    secure: START_TLS_PORTS.has(port) ? false : port === 465 ? true : Boolean(saved.secure),
    user: saved.user,
    pass: saved.pass,
    from: saved.from,
    fromName: saved.fromName,
  };
}

/** Prefer office SMTP, then Settings global SMTP, then env. */
export async function resolveSmtpConfig(officeId?: string | null): Promise<SmtpConfig | null> {
  if (officeId) {
    const officeSaved = await readOfficeSmtpSettings(officeId);
    if (officeSaved) return configFromRecord(officeSaved);
  }
  const saved = await readSmtpSettings();
  if (saved) return configFromRecord(saved);
  const env = configFromEnv();
  if (!env) return null;
  return {
    ...env,
    fromName: process.env.EMAIL_FROM_NAME || process.env.ADMIN_NAME || undefined,
  };
}

export async function isEmailConfigured(officeId?: string | null) {
  return Boolean(await resolveSmtpConfig(officeId));
}

/** Safe summary for Settings page (never returns the password). */
export async function getSmtpPublicStatus(officeId?: string | null) {
  if (officeId) {
    const officeSaved = await readOfficeSmtpSettings(officeId);
    const host = officeSaved?.host || "";
    const provider =
      officeSaved?.provider === "gmail" || host.toLowerCase().includes("gmail.com")
        ? ("gmail" as const)
        : ("custom" as const);
    return {
      configured: Boolean(officeSaved),
      source: officeSaved ? ("office" as const) : ("none" as const),
      provider,
      host,
      port: officeSaved?.port || 465,
      secure: officeSaved?.secure ?? true,
      user: officeSaved?.user || "",
      from: officeSaved?.from || "",
      fromName: officeSaved?.fromName || "",
      hasPassword: Boolean(officeSaved?.pass),
      updatedAt: officeSaved?.updatedAt || "",
    };
  }

  const saved = await readSmtpSettings();
  const env = configFromEnv();
  const active = saved || env;
  const host = active?.host || "";
  const provider =
    saved?.provider === "gmail" || host.toLowerCase().includes("gmail.com")
      ? ("gmail" as const)
      : ("custom" as const);
  return {
    configured: Boolean(active),
    source: saved ? ("settings" as const) : env ? ("environment" as const) : ("none" as const),
    provider,
    host,
    port: active?.port || 465,
    secure: active?.secure ?? true,
    user: active?.user || "",
    from: active?.from || "",
    fromName: saved?.fromName || "",
    hasPassword: Boolean(active?.pass),
    updatedAt: saved?.updatedAt || "",
  };
}

function encodeHeader(value: string) {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value).toString("base64")}?=`;
}

function normalizeRecipients(to: string | string[]) {
  return (Array.isArray(to) ? to : [to]).map((item) => item.trim()).filter(Boolean);
}

function extractEmail(value: string) {
  const angleMatch = value.match(/<([^>]+)>/);
  return (angleMatch?.[1] || value).trim();
}

/** Build RFC-friendly From: Display Name <email@domain> */
export function formatFromAddress(from: string, fromName?: string) {
  const email = extractEmail(from);
  const name = String(fromName || "").trim().replace(/[\r\n"]/g, "");
  if (!name) {
    if (from.includes("<") && from.includes(">")) return from.trim();
    return email;
  }
  return `${encodeHeader(name)} <${email}>`;
}

function createTransporter(config: SmtpConfig) {
  const port = Number(config.port);
  const useStartTls = START_TLS_PORTS.has(port) || !config.secure;
  const user = config.user.trim();
  const pass = config.pass.trim();

  return nodemailer.createTransport({
    host: config.host,
    port,
    secure: useStartTls ? false : true,
    requireTLS: useStartTls,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  });
}

async function sendSmtp(config: SmtpConfig, options: MailOptions) {
  const user = config.user.trim();
  const fromAddress = formatFromAddress(options.from || config.from, config.fromName);
  const recipients = normalizeRecipients(options.to);
  const transporter = createTransporter(config);

  try {
    await transporter.sendMail({
      from: fromAddress,
      to: recipients.join(", "),
      replyTo: extractEmail(fromAddress),
      subject: options.subject,
      text: options.text,
      html: options.html,
      envelope: {
        from: extractEmail(user),
        to: recipients.map((item) => extractEmail(item)),
      },
      attachments: (options.attachments || []).map((attachment) => ({
        filename: attachment.filename,
        path: attachment.filePath,
        contentType: attachment.contentType,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown SMTP error";
    console.error("[smtp] send failed", {
      host: config.host,
      port: config.port,
      secure: config.secure,
      user: config.user.trim(),
      passLength: config.pass.trim().length,
      reason: message,
    });
    throw error;
  } finally {
    transporter.close();
  }
}

export async function sendMail(options: MailOptions): Promise<MailResult> {
  const config = await resolveSmtpConfig(options.officeId);
  if (!config) {
    return { sent: false, reason: "SMTP is not configured." };
  }

  const recipients = normalizeRecipients(options.to);
  if (!recipients.length) {
    return { sent: false, reason: "No recipient email address." };
  }

  // One SMTP transaction per recipient for reliable Gmail/other inbox delivery.
  let sentCount = 0;
  let lastReason = "";
  for (const recipient of recipients) {
    try {
      await sendSmtp(config, { ...options, to: recipient });
      sentCount += 1;
    } catch (error) {
      console.error("SMTP send error:", recipient, error);
      lastReason = error instanceof Error ? error.message : "Unknown SMTP error";
    }
  }

  if (sentCount === recipients.length) return { sent: true };
  if (sentCount > 0) {
    return { sent: true, reason: `Sent ${sentCount}/${recipients.length}. Last error: ${lastReason}` };
  }
  return { sent: false, reason: lastReason || "Unknown SMTP error" };
}

/** Sends a plain test message — used by Settings to verify inbox delivery. */
export async function sendSmtpTestEmail(to: string, officeId?: string | null) {
  const config = await resolveSmtpConfig(officeId);
  if (!config) return { sent: false, reason: "SMTP is not configured." };
  const result = await sendMail({
    to,
    officeId,
    subject: `Valliani Contracts SMTP test (${new Date().toLocaleString()})`,
    text: `This is a test email from Valliani Contracts.\n\nSMTP host: ${config.host}\nFrom: ${config.from}\nTime: ${new Date().toISOString()}\n\nIf you received this, outbound email is working.`,
    html: `<p>This is a test email from <strong>Valliani Contracts</strong>.</p><p>SMTP host: ${config.host}<br/>From: ${config.from}<br/>Time: ${new Date().toISOString()}</p><p>If you received this, outbound email is working.</p>`,
  });
  if (!result.sent) return result;
  return {
    sent: true,
    reason: `OK via ${config.host}:${config.port} (nodemailer starttls)`,
  };
}

export function buildAppUrl(pathname: string) {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

export function getStorageFilePath(storedPath: string) {
  return path.join(process.cwd(), storedPath);
}
