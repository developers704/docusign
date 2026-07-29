"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function PublicWebFormClient({
  slug,
  formName,
  instructions,
  unavailable = false,
}: {
  slug: string;
  formName: string;
  instructions: string;
  unavailable?: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (unavailable) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/webforms/${slug}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });
      const data = (await response.json()) as { error?: string; signUrl?: string };
      if (!response.ok || !data.signUrl) {
        setError(data.error || "Unable to submit this Web Form.");
        return;
      }
      router.push(data.signUrl);
    } catch {
      setError("Unable to submit this Web Form.");
    } finally {
      setBusy(false);
    }
  }

  if (unavailable) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f3f9] px-4 py-10">
        <div className="w-full max-w-lg rounded-lg bg-white p-8 text-center shadow-[0_8px_32px_rgba(0,0,0,.12)]">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-[#666]">Web Form</p>
          <h1 className="mt-1 text-[24px] font-semibold text-[#000]">{formName}</h1>
          <p className="mt-4 text-[14px] text-[#666]">
            This form is not available yet. The sender still needs to add signature fields to the template.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6f3f9] px-4 py-10">
      <form onSubmit={onSubmit} className="w-full max-w-lg rounded-lg bg-white p-8 shadow-[0_8px_32px_rgba(0,0,0,.12)]">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-[#666]">Web Form</p>
        <h1 className="mt-1 text-[24px] font-semibold text-[#000]">{formName}</h1>
        <p className="mt-2 text-[14px] text-[#666]">{instructions || "Complete the fields below to begin signing."}</p>
        <label className="mt-6 block text-[12px] font-semibold uppercase text-[#666]">Full name</label>
        <input
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="mt-1 h-10 w-full rounded-[2px] border border-[#c6c6c6] px-3 text-[14px]"
        />
        <label className="mt-4 block text-[12px] font-semibold uppercase text-[#666]">Email</label>
        <input
          required
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1 h-10 w-full rounded-[2px] border border-[#c6c6c6] px-3 text-[14px]"
        />
        <label className="mt-4 block text-[12px] font-semibold uppercase text-[#666]">Notes</label>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={3}
          className="mt-1 w-full rounded-[2px] border border-[#c6c6c6] px-3 py-2 text-[14px]"
        />
        {error && <p className="mt-3 text-[13px] text-[#b00020]">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="mt-6 h-10 w-full rounded-[2px] bg-[#4c00ff] text-[14px] font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Submitting…" : "Continue to Sign"}
        </button>
      </form>
    </div>
  );
}
