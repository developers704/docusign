import test from "node:test";
import assert from "node:assert/strict";
import {
  createRecipient,
  inferWorkflowType,
  missingRequiredTemplateRoles,
  normalizeRecipientsForSubmit,
  parseRecipientCsv,
  recipientActionLabel,
  setRecipientSigningStep,
  setEnvelopeRecipientOrder,
  validateRecipientForm,
} from "@/lib/recipientFormUtils";

test("default recipient uses signer action label", () => {
  const recipient = createRecipient(0);
  assert.equal(recipient.role, "Signer 1");
  assert.equal(recipient.recipientType, "signer");
  assert.equal(recipientActionLabel(recipient.recipientType), "Needs to sign");
  assert.equal(createRecipient(2).role, "Signer 3");
});

test("signing order off produces parallel workflow", () => {
  const recipients = [createRecipient(0), createRecipient(1), createRecipient(2)];
  const prepared = normalizeRecipientsForSubmit(false, recipients);
  assert.equal(inferWorkflowType(false, prepared), "parallel");
  assert.ok(prepared.every((recipient) => recipient.signingStep === 1));
});

test("unique signing order produces sequential workflow", () => {
  const recipients = [
    { ...createRecipient(0), signingStep: 1 },
    { ...createRecipient(1), signingStep: 2 },
    { ...createRecipient(2), signingStep: 3 },
  ];
  assert.equal(inferWorkflowType(true, recipients), "sequential");
});

test("setRecipientSigningStep swaps steps without moving cards", () => {
  const first = { ...createRecipient(0), name: "First" };
  const second = { ...createRecipient(1), name: "Second", signingStep: 2 };
  const swapped = setRecipientSigningStep([first, second], first.id, 2);
  assert.deepEqual(
    swapped.map((recipient) => ({ name: recipient.name, signingStep: recipient.signingStep, role: recipient.role })),
    [
      { name: "First", signingStep: 2, role: "Signer 2" },
      { name: "Second", signingStep: 1, role: "Signer 1" },
    ]
  );
});

test("setEnvelopeRecipientOrder swaps signing steps and auto roles without moving names", () => {
  const first = {
    id: "a",
    name: "First",
    order: 1,
    signingStep: 1,
    metadata: { roleLabel: "Signer 1" },
  } as unknown as import("@/lib/types").RecipientRecord;
  const second = {
    id: "b",
    name: "Second",
    order: 2,
    signingStep: 2,
    metadata: { roleLabel: "Signer 2" },
  } as unknown as import("@/lib/types").RecipientRecord;
  const swapped = setEnvelopeRecipientOrder([first, second], "a", 2);
  assert.deepEqual(
    swapped.map((recipient) => ({
      id: recipient.id,
      order: recipient.order,
      signingStep: recipient.signingStep,
      roleLabel: recipient.metadata?.roleLabel,
    })),
    [
      { id: "a", order: 1, signingStep: 2, roleLabel: "Signer 2" },
      { id: "b", order: 2, signingStep: 1, roleLabel: "Signer 1" },
    ]
  );
});

test("duplicate signing order produces grouped workflow", () => {
  const recipients = [
    { ...createRecipient(0), signingStep: 1 },
    { ...createRecipient(1), signingStep: 2 },
    { ...createRecipient(2), signingStep: 2 },
  ];
  assert.equal(inferWorkflowType(true, recipients), "grouped");
});

test("optional recipient mapping inverts required flag", () => {
  const recipient = { ...createRecipient(0), required: false };
  assert.equal(recipient.required, false);
});

test("receives copy recipients do not block completion on submit normalization", () => {
  const recipients = [{ ...createRecipient(0), recipientType: "receives_copy" as const, required: true }];
  const prepared = normalizeRecipientsForSubmit(false, recipients);
  assert.equal(prepared[0].required, false);
});

test("validation uses friendly template role message", () => {
  const errors = validateRecipientForm({
    recipients: [{ ...createRecipient(0), name: "Alex", email: "alex@example.com" }],
    signingOrderEnabled: false,
    templateRoles: [
      {
        id: "role-1",
        templateId: "t1",
        versionId: "v1",
        roleName: "Manager",
        roleType: "signer",
        signingOrder: 1,
        signingStep: 1,
        isRequired: true,
        canEditFields: true,
        canViewAllPages: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  });
  assert.ok(errors.some((message) => message.includes("Assign someone to the Manager role.")));
});

test("more than five recipients remain supported in form utilities", () => {
  const recipients = Array.from({ length: 8 }).map((_, index) => createRecipient(index));
  assert.equal(recipients.length, 8);
  assert.equal(inferWorkflowType(false, normalizeRecipientsForSubmit(false, recipients)), "parallel");
});

test("parseRecipientCsv imports name and email rows", () => {
  const result = parseRecipientCsv(
    "name,email\nAli Khan,ali@example.com\nSara Ahmed,sara@example.com",
    "group"
  );
  assert.equal(result.errors.length, 0);
  assert.equal(result.recipients.length, 2);
  assert.equal(result.recipients[0].email, "ali@example.com");
  assert.equal(result.recipients[1].name, "Sara Ahmed");
  assert.ok(result.recipients.every((recipient) => recipient.signingStep === 1));
});

test("parseRecipientCsv assigns sequential signing steps", () => {
  const result = parseRecipientCsv("ali@example.com\nsara@example.com", "sequential");
  assert.equal(result.errors.length, 0);
  assert.deepEqual(
    result.recipients.map((recipient) => recipient.signingStep),
    [1, 2]
  );
});

test("duplicate email validation is user friendly", () => {
  const errors = validateRecipientForm({
    recipients: [
      { ...createRecipient(0), name: "A", email: "same@example.com" },
      { ...createRecipient(1), name: "B", email: "same@example.com" },
    ],
    signingOrderEnabled: false,
    templateRoles: [],
  });
  assert.ok(errors.includes("Two recipients have the same email address."));
});

test("missing required template roles helper", () => {
  const missing = missingRequiredTemplateRoles(
    [
      {
        id: "role-employee",
        templateId: "t1",
        versionId: "v1",
        roleName: "Employee",
        roleType: "signer",
        signingOrder: 1,
        signingStep: 1,
        isRequired: true,
        canEditFields: true,
        canViewAllPages: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    [createRecipient(0)]
  );
  assert.equal(missing.length, 1);
  assert.equal(missing[0].roleName, "Employee");
});
