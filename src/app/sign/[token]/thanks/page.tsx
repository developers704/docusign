import { notFound, redirect } from "next/navigation";
import SignThankYouView from "@/components/SignThankYouView";
import { findEnvelopeByToken } from "@/lib/store";
import { inferRecipientActionType } from "@/lib/services/envelopeWorkflowService";

export default async function SignThankYouPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await findEnvelopeByToken(token);
  if (!found) notFound();

  const done = ["signed", "approved", "acknowledged", "completed", "declined"].includes(found.recipient.status);
  if (!done) {
    redirect(`/sign/${encodeURIComponent(token)}`);
  }

  if (found.recipient.status === "declined") {
    redirect(`/sign/${encodeURIComponent(token)}`);
  }

  const action = inferRecipientActionType(found.recipient);
  const resolvedAction =
    found.recipient.status === "approved"
      ? "approved"
      : found.recipient.status === "acknowledged"
        ? "acknowledged"
        : action;

  return (
    <SignThankYouView
      token={token}
      title={found.envelope.title}
      officeName={found.envelope.officeName}
      recipientName={found.recipient.name}
      envelopeNumber={found.envelope.envelopeNumber}
      action={resolvedAction}
      envelopeCompleted={found.envelope.status === "completed"}
      signedAt={found.recipient.signedAt || found.recipient.completedAt || found.recipient.approvedAt || null}
    />
  );
}
