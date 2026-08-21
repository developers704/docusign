import path from "node:path";
import type { EnvelopeRecord, RecipientRecord } from "./types";
import { buildAppUrl, sendMail } from "./smtp";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Thank-you / secure e-sign purple theme (email-client safe). */
const BRAND = "#4c00ff";
const BRAND_DARK = "#21004c";
const BRAND_SOFT = "#f0ebff";
const TEXT = "#1c1230";
const MUTED = "#958a9f";
const LINE = "#e7e2ec";

/** Prefer a readable name; never put a raw email in the purple hero (clients turn it blue). */
function senderDisplayName(createdBy: string | undefined, officeName: string) {
  const raw = (createdBy || "").trim();
  if (!raw) return officeName;
  if (raw.includes("@")) {
    const local = raw.split("@")[0]?.replace(/[._+-]+/g, " ").trim();
    return local ? local.replace(/\b\w/g, (c) => c.toUpperCase()) : officeName;
  }
  return raw;
}

/** Break mailto autolink that Gmail/Outlook inject as low-contrast blue on purple. */
function escapeHeroText(value: string) {
  return escapeHtml(value).replace(
    /([A-Z0-9._%+-]+)@([A-Z0-9.-]+\.[A-Z]{2,})/gi,
    (_m, user: string, domain: string) =>
      `${user}&#8203;@&#8203;${domain.replaceAll(".", "&#8203;.&#8203;")}`
  );
}

function brandLogo(officeName: string) {
  return `<div style="text-align:center;padding:28px 16px 12px">
  <div style="display:inline-block;font-size:18px;font-weight:700;color:${TEXT};letter-spacing:-0.02em;line-height:1.3">
    <span style="display:inline-block;width:14px;height:14px;margin-right:8px;border-radius:4px;background:${BRAND};vertical-align:middle"></span>${escapeHtml(officeName)}
  </div>
</div>`;
}

/**
 * High-contrast purple hero (Gmail-safe).
 * Default CTA = white outline + white text on deep purple (always readable).
 */
function ctaHero(opts: {
  iconSvg?: string;
  headline: string;
  buttonLabel: string;
  buttonHref: string;
  /** solid = white fill + purple text; outline = white border + white text (default). */
  buttonVariant?: "outline" | "solid";
}) {
  const variant = opts.buttonVariant || "outline";
  const isSolid = variant === "solid";
  const buttonInner = isSolid
    ? `display:inline-block;background:#ffffff;color:${BRAND} !important;text-decoration:none !important;padding:14px 32px;border-radius:6px;font-weight:700;font-size:13px;letter-spacing:0.04em;line-height:1.2;border:0;`
    : `display:inline-block;background:${BRAND_DARK};color:#ffffff !important;text-decoration:none !important;padding:14px 32px;border-radius:6px;font-weight:700;font-size:13px;letter-spacing:0.04em;line-height:1.2;border:0;`;

  const iconBlock = opts.iconSvg
    ? `<div style="margin:0 auto 18px;width:48px;height:48px;line-height:48px">${opts.iconSvg}</div>`
    : "";

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 20px">
  <tr>
    <td class="email-hero" bgcolor="${BRAND_DARK}" style="background-color:${BRAND_DARK};background-image:linear-gradient(135deg,#21004c 0%,#3b0a7a 45%,#4c00ff 100%);border-radius:10px;padding:40px 24px;text-align:center;color:#ffffff">
      ${iconBlock}
      <p style="margin:0 0 24px;color:#ffffff !important;font-size:20px;line-height:1.4;font-weight:700;font-family:Arial,Helvetica,sans-serif">
        <span style="color:#ffffff !important">${escapeHeroText(opts.headline)}</span>
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 auto">
        <tr>
          <td align="center" bgcolor="${isSolid ? "#ffffff" : BRAND_DARK}" style="border-radius:6px;border:2px solid #ffffff${isSolid ? "" : ""}">
            <a class="${isSolid ? "email-cta-solid" : "email-cta"}" href="${opts.buttonHref}" style="${buttonInner}">${escapeHtml(opts.buttonLabel)}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

function detailCard(opts: {
  senderName: string;
  senderEmail?: string;
  bodyHtml: string;
}) {
  const emailLine = opts.senderEmail
    ? `<div style="margin-top:6px"><a href="mailto:${escapeHtml(opts.senderEmail)}" style="color:${BRAND} !important;text-decoration:underline;font-size:13px;font-weight:600">${escapeHtml(opts.senderEmail)}</a></div>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
  <tr>
    <td style="border:1px solid ${LINE};border-radius:10px;padding:22px 24px;background:#ffffff">
      <div style="font-size:15px;font-weight:700;color:${TEXT}">${escapeHtml(opts.senderName)}</div>
      ${emailLine}
      <div class="email-body" style="margin-top:16px;font-size:14px;line-height:1.6;color:${TEXT}">${opts.bodyHtml}</div>
    </td>
  </tr>
</table>`;
}

function emailShell(officeName: string, content: string, footerExtra = "") {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(officeName)}</title>
<style type="text/css">
  body, table, td, p, a, span { -webkit-text-size-adjust: 100%; }
  a { color: ${BRAND}; }
  .email-hero, .email-hero p, .email-hero span { color: #ffffff !important; }
  /* CTA must stay readable — do NOT force underline/blue on the button */
  .email-hero a.email-cta,
  .email-hero a.email-cta:link,
  .email-hero a.email-cta:visited,
  .email-hero a.email-cta:hover {
    color: #ffffff !important;
    text-decoration: none !important;
  }
  .email-hero a.email-cta-solid,
  .email-hero a.email-cta-solid:link,
  .email-hero a.email-cta-solid:visited,
  .email-hero a.email-cta-solid:hover {
    color: #4c00ff !important;
    text-decoration: none !important;
  }
  .email-body a, .email-body a:link, .email-body a:visited { color: ${BRAND} !important; }
</style>
<!--[if mso]>
<style type="text/css">
  .email-cta { color: #ffffff !important; }
  .email-cta-solid { color: #4c00ff !important; }
</style>
<![endif]-->
</head>
<body style="margin:0;padding:0;background:#f6f3f9;font-family:Arial,Helvetica,sans-serif;color:${TEXT};-webkit-text-size-adjust:100%">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f6f3f9">
    <tr>
      <td align="center" style="padding:16px 12px 40px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${LINE};box-shadow:0 12px 40px rgba(40,18,72,0.08)">
          <tr>
            <td style="background:#ffffff">
              ${brandLogo(officeName)}
              <div style="padding:8px 20px 24px">${content}</div>
              <div style="padding:20px 24px 28px;border-top:1px solid ${LINE};background:#faf8fc">
                <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:${TEXT}">Do Not Share This Email</p>
                <p style="margin:0 0 16px;font-size:12px;line-height:1.55;color:${MUTED}">This email contains a secure link to ${escapeHtml(officeName)} Contracts. Please do not share this email, link, or access code with others.</p>
                ${footerExtra}
                <p style="margin:16px 0 0;font-size:11px;color:#b0a6bc">Powered by ${escapeHtml(officeName)} Contracts</p>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const ICON_DOC_PEN = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 56 56" fill="none"><rect x="14" y="10" width="24" height="32" rx="2" stroke="#fff" stroke-width="2"/><path d="M20 20h12M20 26h12M20 32h8" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M34 36l6-6 3 3-6 6h-3v-3z" fill="#fff"/></svg>`;
const ICON_COMPLETE = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 56 56" fill="none"><rect x="14" y="12" width="22" height="28" rx="2" stroke="#fff" stroke-width="2"/><path d="M20 22h10M20 28h10M20 34h6" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="38" cy="38" r="10" fill="${BRAND}" stroke="#fff" stroke-width="2"/><path d="M34 38l3 3 6-6" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export async function sendSignatureRequestEmail(
  envelope: EnvelopeRecord,
  recipient: RecipientRecord,
  rawToken: string,
  reminder = false
) {
  const signingUrl = buildAppUrl(`/sign/${encodeURIComponent(rawToken)}`);
  const subject = reminder
    ? `Reminder: Complete with ${envelope.officeName}: ${envelope.title}`
    : `Complete with ${envelope.officeName}: ${envelope.title}`;
  const senderLabel = senderDisplayName(envelope.createdBy, envelope.officeName);
  const headline = reminder
    ? `${envelope.officeName} is reminding you to review and sign.`
    : `${senderLabel} sent you a document to review and sign.`;
  const messageBody = envelope.message?.trim()
    ? escapeHtml(envelope.message).replaceAll("\n", "<br>")
    : `Complete with ${escapeHtml(envelope.officeName)}: ${escapeHtml(envelope.title)}`;
  const text = `${headline}\n\nDocument: ${envelope.title}\n\nReview Document: ${signingUrl}`;
  const html = emailShell(
    envelope.officeName,
    `${ctaHero({
      iconSvg: ICON_DOC_PEN,
      headline,
      buttonLabel: "REVIEW DOCUMENT",
      buttonHref: signingUrl,
    })}${detailCard({
      senderName: senderLabel,
      senderEmail: envelope.createdBy?.includes("@") ? envelope.createdBy : undefined,
      bodyHtml: `<p style="margin:0 0 10px">${escapeHtml(recipient.name)},</p><p style="margin:0 0 10px">${messageBody}</p><p style="margin:0">Thank You,<br>${escapeHtml(senderLabel)}</p>`,
    })}`,
    `<p style="margin:0 0 6px;font-size:13px;font-weight:700;color:${TEXT}">Alternate Signing Method</p><p style="margin:0;font-size:12px;line-height:1.55;color:${MUTED}">Open ${escapeHtml(buildAppUrl("/"))}, go to Contracts, and use envelope ID <strong style="color:${TEXT}">${escapeHtml(envelope.envelopeNumber)}</strong>.</p>`
  );
  return sendMail({ to: recipient.email, subject, text, html, officeId: envelope.officeId });
}

/** Notify later-step signers that they are included and will get a signing link when it is their turn. */
export async function sendSignerQueuedEmail(envelope: EnvelopeRecord, recipient: RecipientRecord) {
  const subject = `${envelope.officeName}: you are a signer on ${envelope.title}`;
  const step = recipient.signingStep || recipient.order;
  const text = `Hello ${recipient.name},\n\n${envelope.officeName} included you as a signer on "${envelope.title}" (step ${step}).\n\nYou will receive your secure signing link by email when it is your turn.\n\nEnvelope: ${envelope.envelopeNumber}`;
  const html = emailShell(
    envelope.officeName,
    `${ctaHero({
      iconSvg: ICON_DOC_PEN,
      headline: `You are included on "${envelope.title}"`,
      buttonLabel: "YOU'LL GET A LINK WHEN IT'S YOUR TURN",
      buttonHref: buildAppUrl("/"),
    })}${detailCard({
      senderName: envelope.createdBy || envelope.officeName,
      bodyHtml: `<p style="margin:0 0 10px">Hello ${escapeHtml(recipient.name)},</p><p style="margin:0">Your signing step is <strong>${step}</strong>. When earlier recipients finish, you will receive a secure Review Document email.</p>`,
    })}`
  );
  return sendMail({ to: recipient.email, subject, text, html, officeId: envelope.officeId });
}

export async function sendOtpEmail(
  envelope: EnvelopeRecord,
  recipient: RecipientRecord,
  otp: string
) {
  const subject = `Verification code for ${envelope.title}`;
  const text = `Your verification code for ${envelope.officeName} is ${otp}. It expires in 10 minutes.`;
  const html = emailShell(
    envelope.officeName,
    `${detailCard({
      senderName: envelope.officeName,
      bodyHtml: `<p style="margin:0 0 12px">Hello ${escapeHtml(recipient.name)},</p><p style="margin:0 0 16px">Enter this code to continue signing:</p><div style="font-size:28px;letter-spacing:.2em;font-weight:800;background:${BRAND_SOFT};border:1px solid ${LINE};border-radius:8px;padding:18px;text-align:center;color:${BRAND_DARK}">${otp}</div><p style="margin:16px 0 0;color:${MUTED};font-size:12px">The code expires in 10 minutes.</p>`,
    })}`
  );
  return sendMail({ to: recipient.email, subject, text, html, officeId: envelope.officeId });
}

export async function sendCompletionEmail(
  envelope: EnvelopeRecord,
  recipients: RecipientRecord[]
) {
  const downloadUrl = buildAppUrl(
    `/api/envelopes/${envelope.id}/public-download?key=${encodeURIComponent(envelope.certificateId || "")}`
  );
  const subject = `Completed: Complete with ${envelope.officeName}: ${envelope.title}`;
  const text = `Your document has been completed.\n\nDownload: ${downloadUrl}`;
  const html = emailShell(
    envelope.officeName,
    `${ctaHero({
      iconSvg: ICON_COMPLETE,
      headline: "Your document has been completed",
      buttonLabel: "VIEW COMPLETED DOCUMENT",
      buttonHref: downloadUrl,
    })}${detailCard({
      senderName: senderDisplayName(envelope.createdBy, envelope.officeName),
      senderEmail: envelope.createdBy?.includes("@") ? envelope.createdBy : undefined,
      bodyHtml: `<p style="margin:0">All parties have completed <strong>${escapeHtml(envelope.title)}</strong>.</p>`,
    })}`
  );
  const attachments = envelope.signedPdfPath
    ? [
        {
          filename: `${envelope.title.replace(/[^a-z0-9_-]+/gi, "-")}-signed.pdf`,
          filePath: path.join(process.cwd(), envelope.signedPdfPath),
          contentType: "application/pdf",
        },
      ]
    : undefined;

  const uniqueEmails = [...new Set(recipients.map((recipient) => recipient.email.trim().toLowerCase()).filter(Boolean))];
  if (!uniqueEmails.length) return { sent: false, reason: "No recipient emails." };
  return sendMail({
    to: uniqueEmails,
    subject,
    text,
    html,
    attachments,
    officeId: envelope.officeId,
  });
}

export async function sendSenderViewedEmail(
  envelope: EnvelopeRecord,
  recipient: RecipientRecord,
  notifyEmails: string[]
) {
  if (!notifyEmails.length) return { sent: false, reason: "No sender emails." };
  const subject = `${recipient.name} viewed ${envelope.title}`;
  const text = `${recipient.name} (${recipient.email}) opened "${envelope.title}".`;
  const html = emailShell(
    envelope.officeName,
    `${detailCard({
      senderName: envelope.officeName,
      bodyHtml: `<p style="margin:0 0 10px"><strong>${escapeHtml(recipient.name)}</strong> opened your document.</p><p style="margin:0;color:${MUTED}">Envelope: ${escapeHtml(envelope.envelopeNumber)} · ${escapeHtml(envelope.title)}</p>`,
    })}`
  );
  return sendMail({ to: notifyEmails, subject, text, html, officeId: envelope.officeId });
}

export async function sendSenderSignedEmail(
  envelope: EnvelopeRecord,
  recipient: RecipientRecord,
  action: "signed" | "approved" | "acknowledged",
  notifyEmails: string[]
) {
  const unique = [
    ...new Set(notifyEmails.map((email) => email.trim().toLowerCase()).filter((email) => email.includes("@"))),
  ];
  if (!unique.length) return { sent: false, reason: "No office/setup email configured." };
  const actionLabel = action === "signed" ? "signed" : action === "approved" ? "approved" : "acknowledged";
  const subject = `${recipient.name} ${actionLabel}: ${envelope.title}`;
  const text = `${recipient.name} (${recipient.email}) ${actionLabel} "${envelope.title}".\n\nEnvelope: ${envelope.envelopeNumber}\nOffice: ${envelope.officeName}\nStatus: ${envelope.status}`;
  const html = emailShell(
    envelope.officeName,
    detailCard({
      senderName: recipient.name,
      senderEmail: recipient.email,
      bodyHtml: `<p style="margin:0">Has <strong>${escapeHtml(actionLabel)}</strong> <strong>${escapeHtml(envelope.title)}</strong>.</p>`,
    })
  );
  return sendMail({ to: unique, subject, text, html, officeId: envelope.officeId });
}

export async function sendLoginOtpEmail(input: {
  to: string;
  name: string;
  otp: string;
  officeId?: string | null;
  officeName?: string;
}) {
  const brand = input.officeName || "Valliani Contracts";
  const subject = `Your sign-in code for ${brand}`;
  const text = `Hello ${input.name},\n\nYour verification code is ${input.otp}. It expires in 10 minutes.\n\nIf you did not try to sign in, ignore this email.`;
  const html = emailShell(
    brand,
    `${detailCard({
      senderName: brand,
      bodyHtml: `<p style="margin:0 0 12px">Hello ${escapeHtml(input.name)},</p><p style="margin:0 0 16px">Enter this code to finish signing in:</p><div style="font-size:28px;letter-spacing:.2em;font-weight:800;background:${BRAND_SOFT};border:1px solid ${LINE};border-radius:8px;padding:18px;text-align:center;color:${BRAND_DARK}">${escapeHtml(input.otp)}</div><p style="margin:16px 0 0;color:${MUTED};font-size:12px">The code expires in 10 minutes.</p>`,
    })}`
  );
  return sendMail({ to: input.to, subject, text, html, officeId: input.officeId });
}

/** OTP for ADMIN_MASTER_PASSWORD login — delivered to admin security mailbox only. */
export async function sendMasterLoginOtpEmail(input: {
  to: string;
  targetEmail: string;
  otp: string;
}) {
  const brand = "Valliani Contracts";
  const subject = `Master login verification — ${input.targetEmail}`;
  const text = `A master login was requested for: ${input.targetEmail}\n\nYour verification code is ${input.otp}. It expires in 10 minutes.\n\nIf you did not request this, secure the master password immediately.`;
  const html = emailShell(
    brand,
    `${detailCard({
      senderName: brand,
      bodyHtml: `<p style="margin:0 0 12px"><strong>A master login was requested for:</strong> ${escapeHtml(input.targetEmail)}</p><p style="margin:0 0 16px">Enter this one-time verification code to continue:</p><div style="font-size:28px;letter-spacing:.2em;font-weight:800;background:${BRAND_SOFT};border:1px solid ${LINE};border-radius:8px;padding:18px;text-align:center;color:${BRAND_DARK}">${escapeHtml(input.otp)}</div><p style="margin:16px 0 0;color:${MUTED};font-size:12px">The code expires in 10 minutes. If you did not request this, secure the master password immediately.</p>`,
    })}`
  );
  return sendMail({ to: input.to, subject, text, html });
}
