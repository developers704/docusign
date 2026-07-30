import type { EnvelopeRecord } from "@/lib/types";

const DONE = new Set(["signed", "completed", "approved", "acknowledged"]);
const WAITING = new Set(["sent", "viewed", "active"]);

export type AgreementRecipientActivity = {
  id: string;
  name: string;
  email: string;
  state: "signed" | "waiting" | "pending";
  sentAt: string | null;
  signedAt: string | null;
};

function actionableSigners(envelope: EnvelopeRecord) {
  return envelope.recipients.filter(
    (recipient) => !["receives_copy", "view_only"].includes(recipient.recipientType || "signer")
  );
}

function recipientState(status: string): AgreementRecipientActivity["state"] {
  if (DONE.has(status)) return "signed";
  if (WAITING.has(status)) return "waiting";
  return "pending";
}

export function agreementSigningProgress(envelope: EnvelopeRecord) {
  if (envelope.status === "completed") {
    return {
      percent: 100,
      stageLabel: "Completed",
      summaryLabel: "Completed",
      waitingForName: null as string | null,
      waitingCount: 0,
      recipients: buildRecipientActivity(envelope),
      canCorrect: false,
    };
  }
  if (envelope.status === "draft") {
    return {
      percent: 0,
      stageLabel: "Draft",
      summaryLabel: "Draft",
      waitingForName: null as string | null,
      waitingCount: 0,
      recipients: buildRecipientActivity(envelope),
      canCorrect: false,
    };
  }

  const signers = actionableSigners(envelope);
  const total = Math.max(1, signers.length);
  const completed = signers.filter((recipient) => DONE.has(recipient.status)).length;
  const current = signers.find((recipient) => WAITING.has(recipient.status));
  const waitingRecipients = signers.filter((recipient) => recipientState(recipient.status) === "waiting");

  // Progress tracks completed signatures only (e.g. 0/2 → 0%, 1/2 → 50%, 2/2 → 100%).
  const percent = Math.round((completed / total) * 100);

  const waitingForName = current?.name || null;
  let stageLabel = envelope.status.replaceAll("_", " ");
  let summaryLabel = stageLabel;

  if (waitingRecipients.length > 1) {
    summaryLabel = `Waiting for ${waitingRecipients.length} others`;
    stageLabel = summaryLabel;
  } else if (waitingRecipients.length === 1) {
    summaryLabel = `Waiting for ${waitingRecipients[0].name}`;
    stageLabel = summaryLabel;
  } else if (current) {
    if (current.status === "sent") stageLabel = `Sent — waiting for ${current.name}`;
    else if (current.status === "viewed") stageLabel = `In review — ${current.name}`;
    else stageLabel = `Waiting for ${current.name}`;
    summaryLabel = stageLabel;
  } else if (completed > 0 && completed < total) {
    stageLabel = "Waiting for next signer";
    summaryLabel = stageLabel;
  }

  const canCorrect =
    ["sent", "viewed", "scheduled"].includes(envelope.status) &&
    signers.every((recipient) => !DONE.has(recipient.status));

  return {
    percent,
    stageLabel,
    summaryLabel,
    waitingForName,
    waitingCount: waitingRecipients.length,
    recipients: buildRecipientActivity(envelope),
    canCorrect,
  };
}

export function buildRecipientActivity(envelope: EnvelopeRecord): AgreementRecipientActivity[] {
  return actionableSigners(envelope).map((recipient) => ({
    id: recipient.id,
    name: recipient.name,
    email: recipient.email,
    state: recipientState(recipient.status),
    sentAt: recipient.sentAt,
    signedAt: recipient.signedAt,
  }));
}

export function formatRecipientSentAt(iso: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
