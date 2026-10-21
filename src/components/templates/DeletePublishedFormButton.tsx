"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DeletePublishedFormButton({
  kind,
  id,
  name,
}: {
  kind: "powerform" | "webform";
  id: string;
  name: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const label = kind === "powerform" ? "PowerForm" : "Web Form";
  const href = kind === "powerform" ? `/api/admin/powerforms/${id}` : `/api/admin/webforms/${id}`;

  async function onDelete() {
    if (!window.confirm(`Delete ${label} “${name}”? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const response = await fetch(href, { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        window.alert(data.error || `Unable to delete ${label}.`);
        return;
      }
      router.refresh();
    } catch {
      window.alert(`Unable to delete ${label}.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onDelete()}
      className="inline-flex h-8 items-center rounded-[2px] border border-[#f5c2c7] bg-[#fff5f5] px-3 text-[12px] font-semibold text-[#b00020] hover:bg-[#ffe8ea] disabled:opacity-50"
    >
      {busy ? "Deleting…" : "Delete"}
    </button>
  );
}
