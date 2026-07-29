"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { PowerFormCustomIntakeField, PowerFormRecord } from "@/lib/types";

type PublicFormView = Pick<
  PowerFormRecord,
  | "name"
  | "description"
  | "accessType"
  | "requireAccessCode"
  | "requireEmailVerification"
  | "requireConsent"
  | "consentText"
  | "collectName"
  | "collectEmail"
  | "collectPhone"
  | "collectEmployeeId"
  | "customIntakeFields"
  | "successMessage"
>;

export default function PublicPowerFormClient({
  slug,
  form,
  officeName,
  unavailable = false,
  unavailableReason = "",
}: {
  slug: string;
  form: PublicFormView;
  officeName?: string;
  unavailable?: boolean;
  unavailableReason?: string;
}) {
  const [intake, setIntake] = useState<Record<string, string>>({});
  const [accessCode, setAccessCode] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"form" | "verify" | "opening">("form");
  const [challengeId, setChallengeId] = useState("");
  const [submissionId, setSubmissionId] = useState("");
  const [otp, setOtp] = useState("");

  const customFields = useMemo(() => form.customIntakeFields || [], [form.customIntakeFields]);

  function setField(key: string, value: string) {
    setIntake((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (unavailable) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/powerforms/${encodeURIComponent(slug)}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intake,
          name: intake.name,
          email: intake.email,
          phone: intake.phone,
          employeeId: intake.employeeId,
          accessCode,
          consentAccepted,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        signUrl?: string;
        requiresVerification?: boolean;
        challengeId?: string;
        submissionId?: string;
        message?: string;
      };
      if (!response.ok) {
        setError(data.error || "Unable to start this PowerForm.");
        setBusy(false);
        return;
      }
      if (data.requiresVerification) {
        setChallengeId(data.challengeId || "");
        setSubmissionId(data.submissionId || "");
        setPhase("verify");
        setBusy(false);
        return;
      }
      if (!data.signUrl) {
        setError("Unable to open signing session.");
        setBusy(false);
        return;
      }
      setPhase("opening");
      window.location.assign(data.signUrl.startsWith("/") ? data.signUrl : `/sign/${encodeURIComponent(data.signUrl)}`);
    } catch {
      setError("Unable to start this PowerForm.");
      setBusy(false);
      setPhase("form");
    }
  }

  async function onVerify(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/powerforms/${encodeURIComponent(slug)}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completeVerification: true,
          submissionId,
          challengeId,
          code: otp,
        }),
      });
      const data = (await response.json()) as { error?: string; signUrl?: string };
      if (!response.ok || !data.signUrl) {
        setError(data.error || "Invalid verification code.");
        setBusy(false);
        return;
      }
      setPhase("opening");
      window.location.assign(data.signUrl);
    } catch {
      setError("Unable to verify code.");
      setBusy(false);
    }
  }

  if (unavailable) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f3f9] px-4 py-10">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-[0_8px_32px_rgba(40,18,72,.12)]">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#958a9f]">PowerForm</p>
          {officeName ? <p className="mt-1 text-[12px] font-semibold text-[#4c00ff]">{officeName}</p> : null}
          <h1 className="mt-1 text-[24px] font-semibold tracking-tight text-[#1c1230]">{form.name}</h1>
          <p className="mt-4 text-[14px] leading-6 text-[#6b6578]">
            {unavailableReason || "This form is not available right now."}
          </p>
        </div>
      </div>
    );
  }

  if (phase === "opening") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#f6f3f9] px-4 py-10">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-[0_8px_32px_rgba(40,18,72,.12)]">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[#f0ebff] border-t-[#4c00ff]" />
          <h1 className="mt-5 text-xl font-bold text-[#21004c]">Opening your document…</h1>
          <p className="mt-2 text-sm text-[#6b6578]">{form.successMessage}</p>
        </div>
      </div>
    );
  }

  if (phase === "verify") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f3f9] px-4 py-10">
        <form onSubmit={onVerify} className="w-full max-w-md rounded-2xl bg-white p-8 shadow-[0_8px_32px_rgba(40,18,72,.12)]">
          <h1 className="text-[22px] font-semibold text-[#21004c]">Verify your email</h1>
          <p className="mt-2 text-[14px] text-[#6b6578]">Enter the code we sent to {intake.email}.</p>
          <input
            required
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            className="mt-5 h-11 w-full rounded-lg border border-[#e7e2ec] px-3 text-[14px] outline-none focus:border-[#4c00ff]"
            placeholder="6-digit code"
          />
          {error ? <p className="mt-3 text-[13px] font-medium text-[#b00020]">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="mt-6 h-11 w-full rounded-lg bg-[#4c00ff] text-[14px] font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Verifying…" : "Continue to sign"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6f3f9] px-4 py-10 font-[family-name:var(--font-app)]">
      <form onSubmit={onSubmit} className="w-full max-w-md rounded-2xl bg-white p-8 shadow-[0_8px_32px_rgba(40,18,72,.12)]">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#958a9f]">PowerForm</p>
        {officeName ? <p className="mt-1 text-[12px] font-semibold text-[#4c00ff]">{officeName}</p> : null}
        <h1 className="mt-1 text-[24px] font-semibold tracking-tight text-[#1c1230]">{form.name}</h1>
        <p className="mt-2 text-[14px] leading-6 text-[#6b6578]">
          {form.description || "Enter your details to begin. Next you will review the document and sign."}
        </p>

        {(form.accessType === "access_code" || form.requireAccessCode) && (
          <>
            <label className="mt-6 block text-[12px] font-semibold uppercase text-[#666]">Access code</label>
            <input
              required
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-[#e7e2ec] px-3 text-[14px] outline-none focus:border-[#4c00ff]"
            />
          </>
        )}

        {form.collectName ? (
          <>
            <label className="mt-4 block text-[12px] font-semibold uppercase text-[#666]">Full name</label>
            <input
              required
              value={intake.name || ""}
              onChange={(e) => setField("name", e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-[#e7e2ec] px-3 text-[14px] outline-none focus:border-[#4c00ff]"
            />
          </>
        ) : null}

        {form.collectEmail ? (
          <>
            <label className="mt-4 block text-[12px] font-semibold uppercase text-[#666]">Email</label>
            <input
              required
              type="email"
              value={intake.email || ""}
              onChange={(e) => setField("email", e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-[#e7e2ec] px-3 text-[14px] outline-none focus:border-[#4c00ff]"
            />
          </>
        ) : null}

        {form.collectPhone ? (
          <>
            <label className="mt-4 block text-[12px] font-semibold uppercase text-[#666]">Phone</label>
            <input
              required
              value={intake.phone || ""}
              onChange={(e) => setField("phone", e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-[#e7e2ec] px-3 text-[14px] outline-none focus:border-[#4c00ff]"
            />
          </>
        ) : null}

        {form.collectEmployeeId ? (
          <>
            <label className="mt-4 block text-[12px] font-semibold uppercase text-[#666]">Employee ID</label>
            <input
              required
              value={intake.employeeId || ""}
              onChange={(e) => setField("employeeId", e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-[#e7e2ec] px-3 text-[14px] outline-none focus:border-[#4c00ff]"
            />
          </>
        ) : null}

        {customFields.map((field: PowerFormCustomIntakeField) => (
          <div key={field.id}>
            <label className="mt-4 block text-[12px] font-semibold uppercase text-[#666]">{field.label}</label>
            <input
              required={field.required}
              type={field.type === "email" ? "email" : field.type === "number" ? "number" : "text"}
              value={intake[field.key] || ""}
              onChange={(e) => setField(field.key, e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-[#e7e2ec] px-3 text-[14px] outline-none focus:border-[#4c00ff]"
            />
          </div>
        ))}

        {form.requireConsent ? (
          <label className="mt-5 flex items-start gap-2 text-[13px] text-[#6b6578]">
            <input
              type="checkbox"
              className="mt-1"
              checked={consentAccepted}
              onChange={(e) => setConsentAccepted(e.target.checked)}
              required
            />
            <span>{form.consentText}</span>
          </label>
        ) : null}

        {error ? <p className="mt-3 text-[13px] font-medium text-[#b00020]">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="mt-6 h-11 w-full rounded-lg bg-[#4c00ff] text-[14px] font-semibold text-white hover:bg-[#3d00cf] disabled:opacity-60"
        >
          {busy ? "Starting…" : "Begin Signing"}
        </button>
      </form>
    </div>
  );
}
