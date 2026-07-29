import { notFound, redirect } from "next/navigation";
import SigningWorkspace from "@/components/SigningWorkspace";
import { Icon } from "@/components/Icons";
import { addAuditEvent, createAppNotification, findEnvelopeByToken, getCurrentRecipient, isEnvelopeExpired, writeEnvelopes } from "@/lib/store";
import { canRecipientAct, normalizeWorkflow } from "@/lib/services/envelopeWorkflowService";
import type { EnvelopeStatus } from "@/lib/types";
import { sendSenderViewedEmail } from "@/lib/email";
import { resolveSenderNotifyEmails } from "@/lib/senderNotify";

export default async function SigningPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await findEnvelopeByToken(token);
  if (!found) notFound();
  normalizeWorkflow(found.envelope);
  const now = new Date().toISOString();
  if (isEnvelopeExpired(found.envelope) && !["completed", "voided", "declined"].includes(found.envelope.status)) {
    found.envelope.status = "expired";
    found.envelope.updatedAt = now;
    await writeEnvelopes(found.envelopes);
  }

  const envelopeStatus: EnvelopeStatus = found.envelope.status;
  const recipientDone = ["signed", "approved", "acknowledged", "completed"].includes(found.recipient.status);

  if (recipientDone) {
    redirect(`/sign/${encodeURIComponent(token)}/thanks`);
  }

  if (!found.recipient.viewedAt && !["completed", "voided", "declined", "expired"].includes(found.envelope.status)) {
    found.recipient.viewedAt = now;
    if (found.recipient.status === "sent") found.recipient.status = "viewed";
    if (found.envelope.status === "sent") found.envelope.status = "viewed";
    found.envelope.updatedAt = now;
    await writeEnvelopes(found.envelopes);
    await addAuditEvent({
      officeId: found.envelope.officeId,
      envelopeId: found.envelope.id,
      recipientId: found.recipient.id,
      type: "recipient_viewed",
      message: `${found.recipient.name} opened the signing request`,
      ipAddress: null,
      userAgent: null,
    });
    const notifyEmails = await resolveSenderNotifyEmails(found.envelope);
    const viewedMail = await sendSenderViewedEmail(found.envelope, found.recipient, notifyEmails);
    if (!viewedMail.sent) {
      await addAuditEvent({
        officeId: found.envelope.officeId,
        envelopeId: found.envelope.id,
        recipientId: found.recipient.id,
        type: "email_failed",
        message: `Viewed notice to office failed: ${viewedMail.reason}`,
        ipAddress: null,
        userAgent: null,
      });
    }
    await createAppNotification({
      officeId: found.envelope.officeId,
      envelopeId: found.envelope.id,
      type: "recipient_viewed",
      title: "Document viewed",
      message: `${found.recipient.name} opened "${found.envelope.title}"`,
    });
  }

  const current = getCurrentRecipient(found.envelope);
  const isCurrent = current?.id === found.recipient.id && canRecipientAct(found.envelope, found.recipient);
  const terminal = ["completed", "voided", "declined", "expired"].includes(envelopeStatus);
  const requireOtp = (process.env.REQUIRE_EMAIL_OTP || "false").toLowerCase() === "true";
  const encodedToken = encodeURIComponent(token);
  const documentSrc = `/api/sign/${encodedToken}/document`;
  const myFields = (found.envelope.fields || []).filter((field) => field.recipientId === found.recipient.id);
  const recipientIndex = found.envelope.recipients.findIndex((r) => r.id === found.recipient.id);
  const accentColors = ["#4c00ff", "#047857", "#b45309", "#be123c", "#0369a1"];
  const accentColor = accentColors[Math.max(0, recipientIndex) % accentColors.length];
  const canSign = isCurrent && !terminal;

  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden bg-[#f6f3f9] text-[#21004c]">
      <header className="sticky top-0 z-40 flex h-12 shrink-0 items-center justify-between bg-[#21004c] px-3 text-white pt-[env(safe-area-inset-top)] sm:h-14 sm:px-4">
        <p className="truncate text-[14px] font-semibold sm:text-[15px]">Review and complete</p>
        <div className="flex shrink-0 items-center gap-2">
          {canSign ? (
            <button
              type="button"
              data-finish-sign
              className="min-h-9 rounded-md bg-[#4c00ff] px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-[#3d00cf] sm:px-4"
            >
              Finish
            </button>
          ) : null}
          <a
            href={documentSrc}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-white/80 hover:bg-white/10"
            title="Download"
          >
            <Icon name="download" className="h-4 w-4" />
          </a>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="sr-only">Envelope ID: {found.envelope.envelopeNumber}</p>

          {terminal ? (
            <section className="m-4 rounded border border-[#e0e0e0] bg-white p-6 text-center">
              <h2 className="text-lg font-semibold capitalize">Agreement {envelopeStatus}</h2>
              <p className="mt-2 text-sm text-[#666]">No further signing action is available for this link.</p>
            </section>
          ) : !isCurrent ? (
            <section className="m-4 rounded border border-amber-200 bg-amber-50 p-6 text-center text-amber-950">
              <Icon name="clock" className="mx-auto h-7 w-7" />
              <h2 className="mt-3 text-lg font-semibold">Waiting for another signer</h2>
              <p className="mt-2 text-sm">
                You are in the signing order. You will get an email when it is your turn — after the previous signer
                finishes.
              </p>
            </section>
          ) : (
            <SigningWorkspace
              token={token}
              documentSrc={documentSrc}
              title={found.envelope.title}
              fields={myFields}
              signerName={found.recipient.name}
              signerPhone={found.recipient.phone || ""}
              maskedEmail={(() => {
                const [name, domain] = found.recipient.email.split("@");
                if (!name || !domain) return found.recipient.email;
                return `${name.slice(0, 2)}${"*".repeat(Math.max(2, name.length - 2))}@${domain}`;
              })()}
              requireOtp={requireOtp}
              alreadyVerified={Boolean(found.recipient.otpVerifiedAt)}
              accentColor={accentColor}
              canSign={canSign}
            />
          )}
        </div>

        <aside className="sticky top-12 hidden h-[calc(100dvh-3rem)] w-14 shrink-0 flex-col items-center border-l border-[#e2e8f0] bg-white py-3 md:flex">
          <a
            href={documentSrc}
            target="_blank"
            rel="noreferrer"
            className="flex flex-col items-center gap-1 px-1 py-2 text-[9px] font-semibold text-[#64748b] hover:text-[#4c00ff]"
            title="Download"
          >
            <Icon name="download" className="h-4 w-4" />
            Download
          </a>
          <a
            href={documentSrc}
            target="_blank"
            rel="noreferrer"
            className="mt-2 flex flex-col items-center gap-1 px-1 py-2 text-[9px] font-semibold text-[#64748b] hover:text-[#4c00ff]"
            title="Open PDF to print"
          >
            <Icon name="file" className="h-4 w-4" />
            Print
          </a>
        </aside>
      </div>
    </main>
  );
}
