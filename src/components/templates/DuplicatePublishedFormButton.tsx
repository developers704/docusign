"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DuplicatePublishedFormButton({
  kind,
  id,
}: {
  kind: "powerform" | "webform";
  id: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const label = kind === "powerform" ? "PowerForm" : "Web Form";
  const href =
    kind === "powerform" ? `/api/admin/powerforms/${id}/duplicate` : `/api/admin/webforms/${id}/duplicate`;

  async function onDuplicate() {
    setBusy(true);
    try {
      const response = await fetch(href, { method: "POST" });
      const data = (await response.json()) as { error?: string; id?: string };
      if (!response.ok || !data.id) {
        window.alert(data.error || `Unable to duplicate ${label}.`);
        return;
      }
      if (kind === "powerform") {
        router.push(`/powerforms/edit/${data.id}`);
      } else {
        router.refresh();
      }
      router.refresh();
    } catch {
      window.alert(`Unable to duplicate ${label}.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onDuplicate()}
      className="inline-flex h-8 items-center rounded-[2px] border border-[#c6c6c6] bg-white px-3 text-[12px] font-semibold text-[#21004c] hover:bg-[#f5f5f5] disabled:opacity-50"
    >
      {busy ? "Duplicating…" : "Duplicate"}
    </button>
  );
}
