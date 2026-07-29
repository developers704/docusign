import { readFile } from "node:fs/promises";
import net from "node:net";
import tls from "node:tls";
import path from "node:path";
import { readSmtpSettings } from "./store";

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

/** Settings UI values win over cPanel/.env when a complete SMTP profile is saved. */
export async function resolveSmtpConfig(): Promise<SmtpConfig | null> {
  const saved = await readSmtpSettings();
  if (saved) {
    const port = Number(saved.port) || 465;
    const startTlsPorts = new Set([25, 587, 2525, 2587]);
    return {
      host: saved.host,
      port,
      secure: startTlsPorts.has(port) ? false : port === 465 ? true : Boolean(saved.secure),
      user: saved.user,
      pass: saved.pass,
      from: saved.from,
      fromName: saved.fromName,
    };
  }
  const env = configFromEnv();
  if (!env) return null;
  return {
    ...env,
    fromName: process.env.EMAIL_FROM_NAME || process.env.ADMIN_NAME || undefined,
  };
}

export async function isEmailConfigured() {
  return Boolean(await resolveSmtpConfig());
}

/** Safe summary for Settings page (never returns the password). */
export async function getSmtpPublicStatus() {
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

function wrapBase64(buffer: Buffer) {
  return buffer.toString("base64").match(/.{1,76}/g)?.join("\r\n") || "";
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
    // Keep existing "Name <email>" if already present.
    if (from.includes("<") && from.includes(">")) return from.trim();
    return email;
  }
  return `${encodeHeader(name)} <${email}>`;
}

function senderDomain(email: string) {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1) : "localhost";
}

async function createMimeMessage(config: SmtpConfig, options: MailOptions) {
  const recipients = normalizeRecipients(options.to);
  const fromAddress = formatFromAddress(options.from || config.from, config.fromName);
  const fromEmail = extractEmail(fromAddress);
  const mixedBoundary = `mixed_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const alternativeBoundary = `alt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const hasAttachments = Boolean(options.attachments?.length);
  const lines: string[] = [
    `From: ${fromAddress}`,
    `To: ${recipients.join(", ")}`,
    `Reply-To: ${fromEmail}`,
    `Subject: ${encodeHeader(options.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now()}.${Math.random().toString(16).slice(2)}@${senderDomain(fromEmail)}>`,
    "MIME-Version: 1.0",
    "X-Mailer: Valliani Agreements",
    "Auto-Submitted: auto-generated",
  ];

  if (hasAttachments) {
    lines.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`, "", `--${mixedBoundary}`);
  }

  lines.push(`Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`, "");
  lines.push(
    `--${alternativeBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    options.text,
    ""
  );

  if (options.html) {
    lines.push(
      `--${alternativeBoundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      options.html,
      ""
    );
  }

  lines.push(`--${alternativeBoundary}--`);

  if (hasAttachments) {
    for (const attachment of options.attachments || []) {
      const bytes = await readFile(attachment.filePath);
      lines.push(
        `--${mixedBoundary}`,
        `Content-Type: ${attachment.contentType || "application/octet-stream"}; name="${attachment.filename}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${attachment.filename}"`,
        "",
        wrapBase64(bytes),
        ""
      );
    }
    lines.push(`--${mixedBoundary}--`);
  }

  return lines.join("\r\n").replace(/^\./gm, "..");
}

type SmtpResponse = { code: number; message: string };

function createSmtpSession(socket: net.Socket | tls.TLSSocket) {
  let buffer = "";
  const waiters: Array<{
    resolve: (value: SmtpResponse) => void;
    reject: (error: Error) => void;
  }> = [];

  socket.setEncoding("utf8");
  socket.setTimeout(SMTP_TIMEOUT_MS);

  const flush = () => {
    while (waiters.length) {
      const lines = buffer.split("\r\n");
      if (lines.length < 2) return;

      let endIndex = -1;
      for (let index = 0; index < lines.length - 1; index += 1) {
        // Final SMTP line is "NNN text" (space). Continuations are "NNN-text".
        if (/^\d{3} /.test(lines[index])) {
          endIndex = index;
          break;
        }
      }
      if (endIndex < 0) return;

      const responseLines = lines.slice(0, endIndex + 1);
      buffer = lines.slice(endIndex + 1).join("\r\n");
      const code = Number(responseLines[responseLines.length - 1].slice(0, 3));
      const waiter = waiters.shift();
      waiter?.resolve({ code, message: responseLines.join("\n") });
    }
  };

  socket.on("data", (chunk: string) => {
    buffer += chunk;
    flush();
  });

  socket.on("error", (error) => {
    while (waiters.length) waiters.shift()?.reject(error);
  });

  socket.on("timeout", () => {
    const error = new Error("SMTP connection timed out.");
    while (waiters.length) waiters.shift()?.reject(error);
    socket.destroy(error);
  });

  socket.on("close", () => {
    const error = new Error("SMTP connection closed unexpectedly.");
    while (waiters.length) waiters.shift()?.reject(error);
  });

  const readResponse = () =>
    new Promise<SmtpResponse>((resolve, reject) => {
      waiters.push({ resolve, reject });
      flush();
    });

  const expect = async (allowed: number[]) => {
    const response = await readResponse();
    if (!allowed.includes(response.code)) {
      throw new Error(`SMTP error ${response.code}: ${response.message}`);
    }
    return response;
  };

  const command = async (value: string, allowed: number[]) => {
    socket.write(`${value}\r\n`);
    return expect(allowed);
  };

  return { expect, command };
}

async function connectSocket(config: SmtpConfig) {
  // Shared hosts often block 465/587 (SMTP Tweak) but allow 2525 with STARTTLS.
  const startTlsPorts = new Set([25, 587, 2525, 2587]);
  const useImplicitTls =
    config.port === 465 || (config.secure && !startTlsPorts.has(config.port));
  if (useImplicitTls) {
    const socket = tls.connect({
      host: config.host,
      port: config.port,
      servername: config.host,
      rejectUnauthorized: false,
    });
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      socket.once("error", onError);
      socket.once("secureConnect", () => {
        socket.off("error", onError);
        resolve();
      });
      setTimeout(() => reject(new Error("SMTP TLS connect timed out.")), SMTP_TIMEOUT_MS);
    });
    return { socket, useStartTls: false as const };
  }

  const socket = net.connect({ host: config.host, port: config.port });
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    socket.once("error", onError);
    socket.once("connect", () => {
      socket.off("error", onError);
      resolve();
    });
    setTimeout(() => reject(new Error("SMTP connect timed out.")), SMTP_TIMEOUT_MS);
  });
  return { socket, useStartTls: true as const };
}

async function upgradeToTls(socket: net.Socket, host: string) {
  const secure = tls.connect({
    socket,
    host,
    servername: host,
    rejectUnauthorized: false,
  });
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    secure.once("error", onError);
    secure.once("secureConnect", () => {
      secure.off("error", onError);
      resolve();
    });
    setTimeout(() => reject(new Error("SMTP STARTTLS timed out.")), SMTP_TIMEOUT_MS);
  });
  return secure;
}

async function sendSmtp(config: SmtpConfig, options: MailOptions) {
  const connected = await connectSocket(config);
  let socket: net.Socket | tls.TLSSocket = connected.socket;
  let session = createSmtpSession(socket);

  await session.expect([220]);
  await session.command(`EHLO ${config.host}`, [250]);

  if (connected.useStartTls) {
    await session.command("STARTTLS", [220]);
    socket = await upgradeToTls(socket as net.Socket, config.host);
    session = createSmtpSession(socket);
    await session.command(`EHLO ${config.host}`, [250]);
  }

  const user = config.user.trim();
  const pass = config.pass.trim();
  // Prefer AUTH PLAIN (same as common SMTP test tools / cPanel Postfix).
  const plainToken = Buffer.from(`\u0000${user}\u0000${pass}`, "utf8").toString("base64");
  try {
    await session.command(`AUTH PLAIN ${plainToken}`, [235]);
  } catch (plainError) {
    try {
      await session.command("AUTH LOGIN", [334]);
      await session.command(Buffer.from(user, "utf8").toString("base64"), [334]);
      await session.command(Buffer.from(pass, "utf8").toString("base64"), [235]);
    } catch {
      const detail = plainError instanceof Error ? plainError.message : "Authentication failed";
      throw new Error(
        `${detail}. On cPanel this is often (1) wrong saved password — clear the Password field, type it again, Save; or (2) host SMTP lock — create a mailbox on THIS cPanel (e.g. noreply@docusign.vallianiuniversity.com) and use that host/user, or switch to Gmail SMTP. Port 587 = SSL checkbox OFF; port 465 = SSL ON.`
      );
    }
  }

  // Envelope sender must match authenticated mailbox for most cPanel relays.
  const mailFrom = extractEmail(user);
  await session.command(`MAIL FROM:<${mailFrom}>`, [250]);

  for (const recipient of normalizeRecipients(options.to)) {
    await session.command(`RCPT TO:<${extractEmail(recipient)}>`, [250, 251]);
  }

  await session.command("DATA", [354]);
  const message = await createMimeMessage(config, options);
  socket.write(`${message}\r\n.\r\n`);
  await session.expect([250]);
  try {
    await session.command("QUIT", [221]);
  } catch {
    /* ignore quit failures */
  }
  socket.end();
}

async function sendSmtpWithPortFallback(config: SmtpConfig, options: MailOptions) {
  try {
    await sendSmtp(config, options);
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const isAuthFail = message.includes("535") || /authentication/i.test(message);
    // Many cPanel hosts mishandle remote :587 — retry once on :465 SSL.
    if (isAuthFail && config.port === 587 && !config.host.toLowerCase().includes("gmail.com")) {
      console.warn("[smtp] 587 auth failed; retrying", config.host, "on 465 SSL");
      await sendSmtp({ ...config, port: 465, secure: true }, options);
      return;
    }
    throw error;
  }
}

export async function sendMail(options: MailOptions): Promise<MailResult> {
  const config = await resolveSmtpConfig();
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
      await sendSmtpWithPortFallback(config, { ...options, to: recipient });
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
export async function sendSmtpTestEmail(to: string) {
  const config = await resolveSmtpConfig();
  if (!config) return { sent: false, reason: "SMTP is not configured." };
  const result = await sendMail({
    to,
    subject: `Valliani Agreements SMTP test (${new Date().toLocaleString()})`,
    text: `This is a test email from Valliani Agreements.\n\nSMTP host: ${config.host}\nFrom: ${config.from}\nTime: ${new Date().toISOString()}\n\nIf you received this, outbound email is working.`,
    html: `<p>This is a test email from <strong>Valliani Agreements</strong>.</p><p>SMTP host: ${config.host}<br/>From: ${config.from}<br/>Time: ${new Date().toISOString()}</p><p>If you received this, outbound email is working.</p>`,
  });
  if (!result.sent) return result;
  return {
    sent: true,
    reason: `OK via ${config.host}:${config.port} (build smtp-v3)`,
  };
}

export function buildAppUrl(pathname: string) {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

export function getStorageFilePath(storedPath: string) {
  return path.join(process.cwd(), storedPath);
}
