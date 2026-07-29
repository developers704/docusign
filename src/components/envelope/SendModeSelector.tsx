"use client";

import type { AgreementSendMode } from "@/lib/recipientFormUtils";

export default function SendModeSelector({
  value,
  onChange,
}: {
  value: AgreementSendMode;
  onChange: (mode: AgreementSendMode) => void;
}) {
  const signingOrder = value === "sequential";

  return (
    <div className="space-y-3">
      <label className="inline-flex cursor-pointer items-center gap-2 text-[14px] font-semibold text-[#212121]">
        <input
          type="checkbox"
          checked={signingOrder}
          onChange={(event) => onChange(event.target.checked ? "sequential" : "group")}
          className="h-4 w-4 accent-[#4c00ff]"
        />
        Set signing order
      </label>
      <p className="text-[12px] text-[#666]">
        {signingOrder
          ? "Recipients sign in numbered order. When one finishes, the next gets the email."
          : "All recipients can sign at the same time (no order)."}
      </p>
      <div className="flex flex-wrap gap-3 text-[12px]">
        <button
          type="button"
          onClick={() => onChange("single")}
          className={`font-semibold ${value === "single" ? "text-[#4c00ff]" : "text-[#666] hover:text-[#4c00ff]"}`}
        >
          Send to one person
        </button>
        <span className="text-[#ccc]">·</span>
        <button
          type="button"
          onClick={() => onChange(signingOrder ? "sequential" : "group")}
          className={`font-semibold ${value !== "single" ? "text-[#4c00ff]" : "text-[#666] hover:text-[#4c00ff]"}`}
        >
          Multiple recipients
        </button>
      </div>
    </div>
  );
}
