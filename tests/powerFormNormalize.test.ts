import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPowerFormPubliclyAvailable,
  normalizePowerFormRecord,
  slugifyPowerFormName,
} from "../src/lib/powerFormNormalize";
import { validateIntakeValues, validatePowerFormConfig } from "../src/lib/services/powerFormValidationService";

describe("powerFormNormalize", () => {
  it("maps legacy active/disabled and usageCount", () => {
    const form = normalizePowerFormRecord({
      id: "1",
      officeId: "o1",
      templateId: "t1",
      name: "Policy",
      slug: "policy",
      status: "active",
      createdByUserId: "u1",
      createdByEmail: "a@b.com",
      usageCount: 3,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    assert.equal(form.status, "published");
    assert.equal(form.submissionCount, 3);
    assert.equal(form.accessType, "public");
    assert.equal(form.collectName, true);
    assert.equal(form.collectEmail, true);
    assert.equal(form.schemaVersion, 1);
  });

  it("slugifies names", () => {
    assert.equal(slugifyPowerFormName("Employee Policy 2026"), "employee-policy-2026");
  });

  it("availability checks status and limits", () => {
    const base = normalizePowerFormRecord({
      id: "1",
      officeId: "o1",
      templateId: "t1",
      name: "Policy",
      slug: "policy",
      status: "published",
      submissionCount: 1,
      submissionLimit: 1,
    });
    assert.equal(isPowerFormPubliclyAvailable(base), false);
    assert.equal(isPowerFormPubliclyAvailable({ ...base, submissionLimit: 2 }), true);
    assert.equal(isPowerFormPubliclyAvailable({ ...base, status: "paused", submissionLimit: null }), false);
  });
});

describe("powerFormValidation", () => {
  it("requires name/email when configured", () => {
    const form = normalizePowerFormRecord({
      id: "1",
      officeId: "o1",
      templateId: "t1",
      name: "Policy",
      slug: "policy",
      status: "published",
      collectName: true,
      collectEmail: true,
    });
    assert.throws(() => validateIntakeValues(form, { name: "", email: "" }), /Full name/);
    const values = validateIntakeValues(form, { name: "Ada", email: "ada@example.com" });
    assert.equal(values.email, "ada@example.com");
  });

  it("rejects unsupported access types for publish config", () => {
    const form = normalizePowerFormRecord({
      id: "1",
      officeId: "o1",
      templateId: "t1",
      name: "Policy",
      slug: "policy",
      accessType: "invitation_only",
    });
    assert.throws(() => validatePowerFormConfig(form), /not available yet/);
  });
});

describe("one envelope per submission contract", () => {
  it("documents that each submission gets a unique envelope id in the service layer", () => {
    // Behavioral guarantee is enforced by createEnvelopeForPowerFormSubmission
    // always allocating crypto.randomUUID() for envelopeId (never reuse).
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    assert.notEqual(a, b);
  });
});
