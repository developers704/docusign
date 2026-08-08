"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/Icons";

type PublicStatus = {
  googleDrive: { connected: boolean; folder: string; updatedAt: string };
  oneDrive: { connected: boolean; folder: string; updatedAt: string };
};

type ServerAction = (formData: FormData) => Promise<{ ok: boolean; message?: string }>;

function StatusPill({ connected }: { connected: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
        connected ? "bg-[#ddf8e9] text-[#087a4a]" : "bg-[#f1edf3] text-[#74697c]"
      }`}
    >
      {connected ? "Connected" : "Not connected"}
    </span>
  );
}

function CardShell({
  id,
  icon,
  title,
  desc,
  connected,
  children,
}: {
  id: string;
  icon: IconName;
  title: string;
  desc: string;
  connected: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <article id={id} className="rounded-xl border border-[#ebe6f0] bg-white p-5 shadow-[0_1px_2px_rgba(33,0,76,.04)]">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f5f3ff] text-[#4c00ff]">
          <Icon name={icon} className="h-5 w-5" />
        </span>
        <StatusPill connected={connected} />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-[#2a2040]">{title}</h3>
      <p className="mt-2 min-h-12 text-sm leading-6 text-[#6f657c]">{desc}</p>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-[#4c00ff]"
      >
        {open ? "Hide setup" : "Configure"} <Icon name="arrow" className="h-4 w-4" />
      </button>
      {open ? <div className="mt-4 border-t border-[#f0ebf4] pt-4">{children}</div> : null}
    </article>
  );
}

export default function IntegrationsManager({
  status,
  smtpConnected,
  smtpHref,
  saveStorageAction,
  disconnectAction,
}: {
  status: PublicStatus;
  smtpConnected: boolean;
  smtpHref: string;
  saveStorageAction: ServerAction;
  disconnectAction: ServerAction;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  async function run(action: ServerAction, formData: FormData, busyKey: string) {
    setBusy(busyKey);
    setMessage("");
    try {
      const result = await action(formData);
      setMessage(result.message || (result.ok ? "Saved." : "Could not save."));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setBusy("");
    }
  }

  function onStorageSubmit(provider: string) {
    return async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      formData.set("provider", provider);
      await run(saveStorageAction, formData, provider);
    };
  }

  return (
    <div className="space-y-4">
      {message ? (
        <p className="rounded-xl border border-[#ddd6fe] bg-[#f8f7fc] px-4 py-3 text-sm font-semibold text-[#5b21b6]">
          {message}
        </p>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <article id="smtp" className="rounded-xl border border-[#ebe6f0] bg-white p-5 shadow-[0_1px_2px_rgba(33,0,76,.04)]">
          <div className="flex items-start justify-between">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f5f3ff] text-[#4c00ff]">
              <Icon name="send" className="h-5 w-5" />
            </span>
            <StatusPill connected={smtpConnected} />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-[#2a2040]">SMTP Email</h3>
          <p className="mt-2 min-h-12 text-sm leading-6 text-[#6f657c]">
            Send signature requests, OTP codes, reminders and completed documents.
          </p>
          <a href={smtpHref} className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-[#4c00ff]">
            Open SMTP settings <Icon name="arrow" className="h-4 w-4" />
          </a>
        </article>

        <CardShell
          id="google-drive"
          icon="integration"
          title="Google Drive"
          desc="Archive completed contracts to a Drive folder using an OAuth access token."
          connected={status.googleDrive.connected}
        >
          <form onSubmit={onStorageSubmit("googleDrive")} className="space-y-3">
            <input
              name="accessToken"
              type="password"
              required={!status.googleDrive.connected}
              placeholder={status.googleDrive.connected ? "Leave blank to keep token" : "Google OAuth access token"}
              className="h-10 w-full rounded-xl border border-[#e6e0ec] px-3 text-sm outline-none focus:border-[#a78bfa]"
            />
            <input
              name="folder"
              defaultValue={status.googleDrive.folder}
              placeholder="Folder ID (optional — blank = My Drive root)"
              className="h-10 w-full rounded-xl border border-[#e6e0ec] px-3 text-sm outline-none focus:border-[#a78bfa]"
            />
            <div className="flex flex-wrap gap-2">
              <button
                disabled={busy === "googleDrive"}
                className="h-9 rounded-xl bg-[#4c00ff] px-4 text-xs font-bold text-white disabled:opacity-50"
              >
                {busy === "googleDrive" ? "Saving…" : "Connect Google Drive"}
              </button>
              {status.googleDrive.connected ? (
                <button
                  type="button"
                  disabled={busy === "googleDrive-off"}
                  onClick={() => {
                    const formData = new FormData();
                    formData.set("provider", "googleDrive");
                    void run(disconnectAction, formData, "googleDrive-off");
                  }}
                  className="h-9 rounded-xl border border-[#e6e0ec] px-4 text-xs font-semibold text-[#2a2040]"
                >
                  Disconnect
                </button>
              ) : null}
            </div>
          </form>
        </CardShell>

        <CardShell
          id="onedrive"
          icon="integration"
          title="Microsoft OneDrive"
          desc="Upload completed PDFs to OneDrive / Microsoft Graph with an access token."
          connected={status.oneDrive.connected}
        >
          <form onSubmit={onStorageSubmit("oneDrive")} className="space-y-3">
            <input
              name="accessToken"
              type="password"
              required={!status.oneDrive.connected}
              placeholder={status.oneDrive.connected ? "Leave blank to keep token" : "Microsoft Graph access token"}
              className="h-10 w-full rounded-xl border border-[#e6e0ec] px-3 text-sm outline-none focus:border-[#a78bfa]"
            />
            <input
              name="folder"
              defaultValue={status.oneDrive.folder}
              placeholder="Folder path e.g. Contracts"
              className="h-10 w-full rounded-xl border border-[#e6e0ec] px-3 text-sm outline-none focus:border-[#a78bfa]"
            />
            <div className="flex flex-wrap gap-2">
              <button
                disabled={busy === "oneDrive"}
                className="h-9 rounded-xl bg-[#4c00ff] px-4 text-xs font-bold text-white disabled:opacity-50"
              >
                {busy === "oneDrive" ? "Saving…" : "Connect OneDrive"}
              </button>
              {status.oneDrive.connected ? (
                <button
                  type="button"
                  onClick={() => {
                    const formData = new FormData();
                    formData.set("provider", "oneDrive");
                    void run(disconnectAction, formData, "oneDrive-off");
                  }}
                  className="h-9 rounded-xl border border-[#e6e0ec] px-4 text-xs font-semibold text-[#2a2040]"
                >
                  Disconnect
                </button>
              ) : null}
            </div>
          </form>
        </CardShell>
      </section>
    </div>
  );
}
