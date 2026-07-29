"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PowerFormRecord, PowerFormSubmissionRecord } from "@/lib/types";

export default function PowerFormManagePanel({
  form,
  submissions,
  templateName,
  templateVersionId,
  currentTemplateVersionId,
  appUrl,
}: {
  form: PowerFormRecord;
  submissions: PowerFormSubmissionRecord[];
  templateName: string;
  templateVersionId: string | null;
  currentTemplateVersionId: string | null;
  appUrl: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const publicUrl = `${appUrl}/powerforms/${form.slug}`;
  const canUpgrade = Boolean(
    currentTemplateVersionId && templateVersionId && currentTemplateVersionId !== templateVersionId
  );

  async function setStatus(status: PowerFormRecord["status"]) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/powerforms/${form.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error || "Unable to update status.");
        return;
      }
      setMessage(`Status updated to ${status}.`);
      router.refresh();
    } catch {
      setError("Unable to update status.");
    } finally {
      setBusy(false);
    }
  }

  async function upgradeVersion() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/powerforms/${form.id}/upgrade-version`, { method: "POST" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error || "Unable to upgrade template version.");
        return;
      }
      setMessage("Template version upgraded.");
      router.refresh();
    } catch {
      setError("Unable to upgrade template version.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-[#e7e2ec] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#958a9f]">PowerForm</p>
            <h1 className="mt-1 text-[24px] font-semibold text-[#21004c]">{form.name}</h1>
            <p className="mt-1 text-[14px] text-[#6b6578]">
              Template: {templateName} · Status: <span className="capitalize">{form.status}</span>
            </p>
            <p className="mt-2 break-all text-[13px]">
              Public URL:{" "}
              <a href={publicUrl} className="font-semibold text-[#4c00ff] hover:underline" target="_blank" rel="noreferrer">
                {publicUrl}
              </a>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/powerforms/edit/${form.id}`}
              className="inline-flex h-9 items-center rounded-[2px] border border-[#c6c6c6] px-3 text-[13px] font-semibold"
            >
              Edit
            </Link>
            {form.status !== "published" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setStatus("published")}
                className="h-9 rounded-[2px] bg-[#4c00ff] px-3 text-[13px] font-semibold text-white disabled:opacity-60"
              >
                Publish
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => setStatus("paused")}
                className="h-9 rounded-[2px] border border-[#c6c6c6] px-3 text-[13px] font-semibold disabled:opacity-60"
              >
                Pause
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => setStatus("archived")}
              className="h-9 rounded-[2px] border border-[#f5c2c7] px-3 text-[13px] font-semibold text-[#b00020] disabled:opacity-60"
            >
              Archive
            </button>
          </div>
        </div>
        {canUpgrade ? (
          <div className="mt-4 rounded border border-[#f0ebff] bg-[#f6f3f9] px-3 py-2 text-[13px]">
            A newer template version is available.{" "}
            <button type="button" disabled={busy} onClick={upgradeVersion} className="font-semibold text-[#4c00ff]">
              Upgrade locked version
            </button>
          </div>
        ) : null}
        {message ? <p className="mt-3 text-[13px] font-medium text-[#21004c]">{message}</p> : null}
        {error ? <p className="mt-3 text-[13px] font-medium text-[#b00020]">{error}</p> : null}
      </div>

      <div className="rounded-lg border border-[#e7e2ec] bg-white p-5">
        <h2 className="text-[18px] font-semibold text-[#21004c]">Submissions</h2>
        <p className="mt-1 text-[13px] text-[#6b6578]">Each row is an independent envelope.</p>
        {!submissions.length ? (
          <p className="mt-6 text-[14px] text-[#666]">No submissions yet.</p>
        ) : (
          <table className="mt-4 w-full text-left">
            <thead>
              <tr className="border-b border-[#e5e5e5] text-[12px] font-semibold text-[#666]">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2">Envelope</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((row) => (
                <tr key={row.id} className="border-b border-[#f0f0f0] text-[14px]">
                  <td className="py-3 pr-3 font-medium">{row.submittedByName || "—"}</td>
                  <td className="py-3 pr-3">{row.submittedByEmail || "—"}</td>
                  <td className="py-3 pr-3 capitalize">{row.status.replace(/_/g, " ")}</td>
                  <td className="py-3 pr-3">{new Date(row.createdAt).toLocaleString()}</td>
                  <td className="py-3">
                    {row.envelopeId ? (
                      <Link href={`/envelopes/${row.envelopeId}`} className="font-semibold text-[#4c00ff] hover:underline">
                        Open
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
