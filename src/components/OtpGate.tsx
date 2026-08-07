"use client";

import { useState, type FormEvent } from "react";

export default function OtpGate({ token, maskedEmail, onVerified }: { token: string; maskedEmail: string; onVerified: () => void }) {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    setBusy(true);
    const response = await fetch(`/api/sign/${token}/otp/send`, { method: "POST" });
    const result = (await response.json()) as { error?: string; message?: string };
    setMessage(response.ok ? result.message || "Code sent." : result.error || "Could not send code.");
    setBusy(false);
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const response = await fetch(`/api/sign/${token}/otp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const result = (await response.json()) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setMessage(result.error || "Invalid verification code.");
      return;
    }
    onVerified();
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[.2em] text-slate-500">Identity verification</p>
      <h2 className="mt-2 text-xl font-bold sm:text-2xl">Verify your email</h2>
      <p className="mt-2 text-sm text-slate-600 sm:text-base">A six-digit code will be sent to {maskedEmail}.</p>
      <button type="button" onClick={sendCode} disabled={busy} className="mt-5 min-h-11 w-full rounded-xl bg-[#4c00ff] px-5 py-3 font-semibold text-white hover:bg-[#3d00cf] disabled:opacity-50 sm:w-auto">Send verification code</button>
      <form onSubmit={verify} className="mt-5 flex flex-col gap-3 sm:flex-row">
        <input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" pattern="\d{6}" placeholder="6-digit code" required className="min-h-12 flex-1 rounded-xl border border-slate-300 px-4 py-3 text-center text-xl tracking-[.35em]" />
        <button disabled={busy || code.length !== 6} className="min-h-12 rounded-xl border border-slate-950 px-5 py-3 font-semibold disabled:opacity-50">Verify</button>
      </form>
      {message && <p className="mt-4 rounded-lg bg-slate-100 p-3 text-sm">{message}</p>}
    </div>
  );
}
