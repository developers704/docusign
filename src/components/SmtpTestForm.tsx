"use client";

import { useState } from "react";

export default function SmtpTestForm({
  defaultEmail,
  officeId,
}: {
  defaultEmail: string;
  officeId?: string;
}) {
  const [to, setTo] = useState(defaultEmail);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState<boolean | null>(null);

  async function sendTest() {
    setBusy(true);
    setMessage("");
    setOk(null);
    try {
      const response = await fetch("/api/admin/smtp-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, officeId }),
      });
      const result = (await response.json()) as { error?: string; message?: string; detail?: string };
      if (!response.ok) {
        setOk(false);
        setMessage(result.error || "Test failed.");
      } else {
        setOk(true);
        setMessage(
          [result.message || "Test email sent.", result.detail].filter(Boolean).join(" ")
        );
      }
    } catch {
      setOk(false);
      setMessage("Connection error while sending test email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-800">Send test email</p>
      <p className="mt-1 text-xs text-slate-500">Use this to confirm Gmail / Outlook delivery (also check Spam).</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={to}
          onChange={(event) => setTo(event.target.value)}
          placeholder="you@gmail.com"
          className="h-10 flex-1 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-[#4c00ff]"
        />
        <button
          type="button"
          disabled={busy}
          onClick={sendTest}
          className="h-10 rounded-lg bg-[#4c00ff] px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Sending..." : "Send test"}
        </button>
      </div>
      {message && (
        <p className={`mt-3 text-sm font-medium ${ok ? "text-emerald-700" : "text-red-700"}`}>{message}</p>
      )}
    </div>
  );
}
