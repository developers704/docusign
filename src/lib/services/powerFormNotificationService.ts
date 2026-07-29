import { sendMail } from "@/lib/smtp";

export async function sendPowerFormVerificationEmail(input: {
  to: string;
  formName: string;
  code: string;
}) {
  const subject = `Verification code for ${input.formName}`;
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#21004c">
      <h1 style="font-size:20px;margin:0 0 12px">Verify your email</h1>
      <p style="margin:0 0 16px;color:#6b6578">Use this code to continue with <strong>${escapeHtml(input.formName)}</strong>.</p>
      <p style="font-size:28px;letter-spacing:6px;font-weight:700;margin:0 0 16px;color:#4c00ff">${escapeHtml(input.code)}</p>
      <p style="margin:0;color:#958a9f;font-size:13px">This code expires in 15 minutes.</p>
    </div>
  `;
  await sendMail({
    to: input.to,
    subject,
    html,
    text: `Your verification code for ${input.formName} is ${input.code}`,
  });
}

export async function notifyPowerFormOwnerOfSubmission(input: {
  to: string;
  formName: string;
  signerName: string;
  signerEmail: string;
  envelopeId: string;
}) {
  if (!input.to) return;
  const subject = `New PowerForm submission: ${input.formName}`;
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#21004c">
      <h1 style="font-size:20px;margin:0 0 12px">New submission</h1>
      <p style="margin:0 0 8px"><strong>${escapeHtml(input.signerName)}</strong> (${escapeHtml(input.signerEmail)})</p>
      <p style="margin:0;color:#6b6578">submitted <strong>${escapeHtml(input.formName)}</strong>.</p>
      <p style="margin:16px 0 0;font-size:13px;color:#958a9f">Envelope ID: ${escapeHtml(input.envelopeId)}</p>
    </div>
  `;
  try {
    await sendMail({ to: input.to, subject, html, text: `${input.signerName} submitted ${input.formName}` });
  } catch {
    // Non-blocking for public submit flow.
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
