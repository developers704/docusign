"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import SmtpTestForm from "@/components/SmtpTestForm";

type ServerAction = (formData: FormData) => Promise<void>;

type SmtpStatus = {
  configured: boolean;
  source: "settings" | "environment" | "office" | "none";
  provider: "custom" | "gmail";
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  fromName?: string;
  hasPassword: boolean;
  updatedAt: string;
};

type Provider = "custom" | "gmail";

const GMAIL_PRESET = {
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
};

function inferProvider(host: string): Provider {
  return host.toLowerCase().includes("gmail.com") ? "gmail" : "custom";
}

export default function SmtpSettingsForm({
  status,
  defaultTestEmail,
  saveAction,
  officeId,
}: {
  status: SmtpStatus;
  defaultTestEmail: string;
  saveAction: ServerAction;
  officeId?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [provider, setProvider] = useState<Provider>(status.provider || inferProvider(status.host));
  const [host, setHost] = useState(status.host);
  const [port, setPort] = useState(String(status.port || 465));
  const [secure, setSecure] = useState(status.secure);
  const [user, setUser] = useState(status.user);
  const [from, setFrom] = useState(status.from);
  const [fromName, setFromName] = useState(status.fromName || "");

  const providerHint = useMemo(() => {
    if (provider === "gmail") {
      return "Gmail needs a 16-character App Password (not your normal Gmail password). Enable 2-Step Verification, then create an App Password in Google Account → Security.";
    }
    return "Use your domain mailbox from cPanel / hosting (e.g. mail.yourdomain.com).";
  }, [provider]);

  function applyProvider(next: Provider) {
    setProvider(next);
    if (next === "gmail") {
      setHost(GMAIL_PRESET.host);
      setPort(String(GMAIL_PRESET.port));
      setSecure(GMAIL_PRESET.secure);
      if (!from.trim() && user.trim()) {
        setFrom(`Valliani Contracts <${user.trim()}>`);
      }
    }
  }

  function onPortChange(nextPort: string) {
    setPort(nextPort);
    const n = Number(nextPort);
    if (n === 465) setSecure(true);
    if (n === 587 || n === 2525 || n === 25) setSecure(false);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const formData = new FormData(event.currentTarget);
      formData.set("provider", provider);
      formData.set("host", host);
      formData.set("port", port);
      formData.set("user", user);
      formData.set("from", from);
      formData.set("fromName", fromName);
      if (secure) formData.set("secure", "1");
      else formData.delete("secure");
      await saveAction(formData);
      setMessage(
        provider === "gmail"
          ? "Gmail SMTP saved. Send a test email to confirm the App Password works."
          : "Custom SMTP settings saved. No server restart needed."
      );
      router.refresh();
    } catch (err) {
      const text = err instanceof Error && err.message ? err.message : "Could not save SMTP settings.";
      // Next.js wraps server action errors — prefer a clear line for the user.
      setMessage(text.includes("SMTP") || text.includes("password") || text.includes("data/") ? text : "Could not save SMTP settings. Re-type password and try again, or use Gmail SMTP.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 space-y-5">
      <div
        className={`rounded-md p-4 ${status.configured ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}
      >
        <strong>{status.configured ? "SMTP is configured" : "SMTP is not configured"}</strong>
        <p className="mt-1 text-sm">
          {status.source === "office"
            ? `Using ${status.provider === "gmail" ? "Gmail" : "custom"} SMTP saved for this office portal.`
            : status.source === "settings"
              ? `Using ${status.provider === "gmail" ? "Gmail" : "custom"} SMTP saved in Settings (overrides environment variables).`
              : status.source === "environment"
                ? "Using cPanel / .env environment variables. Save below to manage from this page instead."
                : "Choose Gmail or your domain mailbox below — no backend file edit required."}
        </p>
        {status.updatedAt ? (
          <p className="mt-1 text-xs opacity-80">Last saved: {new Date(status.updatedAt).toLocaleString()}</p>
        ) : null}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold text-[#6b6578]">Email provider</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => applyProvider("custom")}
            className={`rounded-xl border px-4 py-3 text-left transition ${
              provider === "custom"
                ? "border-[#21004c] bg-white ring-1 ring-[#21004c]"
                : "border-[#e7e2ec] bg-[#fafafa] hover:bg-white"
            }`}
          >
            <span className="block text-sm font-bold text-[#21004c]">Custom / cPanel SMTP</span>
            <span className="mt-0.5 block text-xs text-[#6b6578]">Domain mailbox · mail.yourdomain.com</span>
          </button>
          <button
            type="button"
            onClick={() => applyProvider("gmail")}
            className={`rounded-xl border px-4 py-3 text-left transition ${
              provider === "gmail"
                ? "border-[#4c00ff] bg-white ring-1 ring-[#4c00ff]"
                : "border-[#e7e2ec] bg-[#fafafa] hover:bg-white"
            }`}
          >
            <span className="block text-sm font-bold text-[#21004c]">Gmail SMTP</span>
            <span className="mt-0.5 block text-xs text-[#6b6578]">smtp.gmail.com · App Password required</span>
          </button>
        </div>
        <p className="mt-2 text-xs leading-5 text-[#6b6578]">{providerHint}</p>
        {provider === "gmail" ? (
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs leading-5 text-[#4a4458]">
            <li>Google Account → Security → turn on 2-Step Verification</li>
            <li>Security → App passwords → create one for “Mail”</li>
            <li>Paste that 16-character password below (not your Gmail login password)</li>
            <li>
              <strong>cPanel tip:</strong> remote hosts like mail.valliani.app often fail with 535 from
              the server — Gmail SMTP usually works immediately.
            </li>
          </ol>
        ) : null}
      </div>

      <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
        {officeId ? <input type="hidden" name="officeId" value={officeId} /> : null}
        <input type="hidden" name="provider" value={provider} />
        <div>
          <label className="mb-1 block text-xs font-semibold text-[#6b6578]">SMTP host</label>
          <input
            name="host"
            value={host}
            onChange={(event) => setHost(event.target.value)}
            required
            readOnly={provider === "gmail"}
            placeholder={provider === "gmail" ? "smtp.gmail.com" : "mail.yourdomain.com"}
            className={`h-10 w-full rounded-md border border-[#c8c8d3] px-3 text-sm outline-none focus:border-[#21004c] ${
              provider === "gmail" ? "bg-[#f6f3f9] text-[#6b6578]" : ""
            }`}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[#6b6578]">Port</label>
          <input
            name="port"
            type="number"
            value={port}
            onChange={(event) => onPortChange(event.target.value)}
            required
            className="h-10 w-full rounded-md border border-[#c8c8d3] px-3 text-sm outline-none focus:border-[#21004c]"
          />
          {provider === "gmail" ? (
            <p className="mt-1 text-[11px] text-[#6b6578]">465 = SSL (recommended). 587 also works if you turn SSL off.</p>
          ) : (
            <p className="mt-1 text-[11px] text-[#6b6578]">
              2525 = STARTTLS (recommended on cPanel if 587 is blocked). 587 = STARTTLS. 465 = SSL.
            </p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[#6b6578]">
            {provider === "gmail" ? "Gmail address" : "Username"}
          </label>
          <input
            name="user"
            value={user}
            onChange={(event) => {
              const next = event.target.value;
              setUser(next);
              if (provider === "gmail" && (!from || from.includes("@gmail.com") || from.includes(user))) {
                setFrom(next.includes("@") ? `Valliani Contracts <${next.trim()}>` : from);
              }
            }}
            required
            placeholder={provider === "gmail" ? "you@gmail.com" : "signatures@yourdomain.com"}
            className="h-10 w-full rounded-md border border-[#c8c8d3] px-3 text-sm outline-none focus:border-[#21004c]"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[#6b6578]">
            {provider === "gmail" ? "Gmail App Password" : "Password"}
          </label>
          <input
            name="pass"
            type="password"
            autoComplete="new-password"
            placeholder={
              status.hasPassword
                ? "Leave blank to keep current password"
                : provider === "gmail"
                  ? "16-character App Password"
                  : "Mailbox password"
            }
            className="h-10 w-full rounded-md border border-[#c8c8d3] px-3 text-sm outline-none focus:border-[#21004c]"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[#6b6578]">From name (shown in inbox)</label>
          <input
            name="fromName"
            value={fromName}
            onChange={(event) => setFromName(event.target.value)}
            placeholder="e.g. Valliani Contracts"
            className="h-10 w-full rounded-md border border-[#c8c8d3] px-3 text-sm outline-none focus:border-[#21004c]"
          />
          <p className="mt-1 text-[11px] text-[#6b6578]">Emails appear as: From Name &lt;address&gt;</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[#6b6578]">From address</label>
          <input
            name="from"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            required
            placeholder={
              provider === "gmail"
                ? "you@gmail.com"
                : "signatures@yourdomain.com"
            }
            className="h-10 w-full rounded-md border border-[#c8c8d3] px-3 text-sm outline-none focus:border-[#21004c]"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-[#21004c] md:col-span-2">
          <input
            type="checkbox"
            name="secure"
            value="1"
            checked={secure}
            onChange={(event) => setSecure(event.target.checked)}
            className="h-4 w-4 accent-[#4c00ff]"
          />
          Use SSL/TLS (secure) — ON for port 465 only. Ports 587 / 2525 = leave unchecked (STARTTLS).
          On cPanel shared hosting, try <strong>2525</strong> if 465/587 are blocked by SMTP Tweak.
        </label>
        <button
          type="submit"
          disabled={busy}
          className="h-10 rounded-md bg-[#21004c] px-5 text-sm font-bold text-white disabled:opacity-50 md:col-span-2"
        >
          {busy ? "Saving..." : provider === "gmail" ? "Save Gmail SMTP" : "Save custom SMTP"}
        </button>
        {message ? <p className="text-sm font-medium text-emerald-700 md:col-span-2">{message}</p> : null}
      </form>

      {status.configured ? <SmtpTestForm defaultEmail={defaultTestEmail} officeId={officeId} /> : null}
    </div>
  );
}
