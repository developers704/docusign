"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteAgreementButton({
  envelopeId,
  title,
}: {
  envelopeId: string;
  title: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    const confirmed = window.confirm(
      `Delete "${title}" permanently? Documents and signing links will be removed.`
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const response = await fetch(`/api/admin/envelopes/${envelopeId}/delete`, { method: "POST" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        window.alert(result.error || "Could not delete contract.");
        return;
      }
      router.refresh();
    } catch {
      window.alert("Connection error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={onDelete}
      className="rounded-lg px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
    >
      {busy ? "Deleting..." : "Delete"}
    </button>
  );
}
