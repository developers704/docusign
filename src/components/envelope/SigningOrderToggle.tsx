"use client";

export default function SigningOrderToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <div className="rounded-xl border border-[#e8e2ec] bg-[#faf9fc] px-4 py-3">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[#4c00ff]"
        />
        <span>
          <span className="block text-sm font-semibold text-[#2b2038]">Set signing order</span>
          <span className="mt-1 block text-xs leading-5 text-[#776c80]">
            {enabled
              ? "Recipients will receive the contract in this order."
              : "Recipients will receive the contract at the same time."}
          </span>
        </span>
      </label>
    </div>
  );
}
