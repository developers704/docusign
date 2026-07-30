import test from "node:test";
import assert from "node:assert/strict";
import { agreementSigningProgress } from "@/lib/agreementProgress";
import type { EnvelopeRecord, RecipientRecord } from "@/lib/types";

function recipient(partial: Partial<RecipientRecord> & Pick<RecipientRecord, "id" | "name" | "status">): RecipientRecord {
  return {
    envelopeId: "env-1",
    email: `${partial.id}@example.com`,
    order: 1,
    tokenHash: "",
    otpHash: null,
    otpExpiresAt: null,
    sentAt: null,
    viewedAt: null,
    signedAt: null,
    declinedAt: null,
    declineReason: null,
    signatureMethod: null,
    signerIpAddress: null,
    signerUserAgent: null,
    signerTimezone: null,
    recipientType: "signer",
    ...partial,
  } as RecipientRecord;
}

function envelope(status: EnvelopeRecord["status"], recipients: RecipientRecord[]): EnvelopeRecord {
  return {
    id: "env-1",
    status,
    recipients,
  } as EnvelopeRecord;
}

test("agreementSigningProgress maps sent, review, waiting, and completed", () => {
  const oneSent = agreementSigningProgress(
    envelope("sent", [recipient({ id: "a", name: "Ali", status: "sent", order: 1 })])
  );
  assert.equal(oneSent.percent, 0);
  assert.equal(oneSent.summaryLabel, "Waiting for Ali");
  assert.equal(oneSent.canCorrect, true);

  const oneViewed = agreementSigningProgress(
    envelope("viewed", [recipient({ id: "a", name: "Ali", status: "viewed", order: 1 })])
  );
  assert.equal(oneViewed.percent, 0);

  const oneActive = agreementSigningProgress(
    envelope("sent", [recipient({ id: "a", name: "Ali", status: "active", order: 1 })])
  );
  assert.equal(oneActive.percent, 0);

  const done = agreementSigningProgress(
    envelope("completed", [recipient({ id: "a", name: "Ali", status: "signed", order: 1 })])
  );
  assert.equal(done.percent, 100);
  assert.equal(done.canCorrect, false);
});

test("agreementSigningProgress lists waiting recipients and blocks correct after sign", () => {
  const multi = agreementSigningProgress(
    envelope("sent", [
      recipient({ id: "a", name: "Ali", status: "signed", order: 1 }),
      recipient({ id: "b", name: "Bob", status: "sent", order: 2, sentAt: "2026-07-25T19:51:41.000Z" }),
      recipient({ id: "c", name: "Carol", status: "pending", order: 3 }),
    ])
  );
  assert.equal(multi.percent, 33);
  assert.equal(multi.summaryLabel, "Waiting for Bob");
  assert.equal(multi.waitingCount, 1);
  assert.equal(multi.canCorrect, false);
  assert.deepEqual(
    multi.recipients.map((item) => item.state),
    ["signed", "waiting", "pending"]
  );
});

test("agreementSigningProgress percent follows completed signatures only", () => {
  const noneSigned = agreementSigningProgress(
    envelope("sent", [
      recipient({ id: "a", name: "Zaima", status: "sent", order: 1 }),
      recipient({ id: "b", name: "Ali", status: "sent", order: 2 }),
    ])
  );
  assert.equal(noneSigned.percent, 0);
  assert.equal(noneSigned.summaryLabel, "Waiting for 2 others");

  const oneOfTwo = agreementSigningProgress(
    envelope("sent", [
      recipient({ id: "a", name: "Ali", status: "signed", order: 1 }),
      recipient({ id: "b", name: "Zaima", status: "sent", order: 2 }),
    ])
  );
  assert.equal(oneOfTwo.percent, 50);
  assert.equal(oneOfTwo.summaryLabel, "Waiting for Zaima");

  const bothSigned = agreementSigningProgress(
    envelope("completed", [
      recipient({ id: "a", name: "Ali", status: "signed", order: 1 }),
      recipient({ id: "b", name: "Zaima", status: "signed", order: 2 }),
    ])
  );
  assert.equal(bothSigned.percent, 100);
});
