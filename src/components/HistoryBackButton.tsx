"use client";

import { useRouter } from "next/navigation";

/** Goes back in history when possible; otherwise navigates to fallbackHref. */
export default function HistoryBackButton({
  fallbackHref = "/",
  label = "Back",
  className,
}: {
  fallbackHref?: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
          return;
        }
        router.push(fallbackHref);
      }}
      className={className}
    >
      {label}
    </button>
  );
}
