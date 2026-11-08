"use client";

import { useRouter } from "next/navigation";

/** Goes back in history when possible; otherwise navigates to fallbackHref. */
export default function HistoryBackButton({
  fallbackHref = "/",
  label = "Back",
  className,
  iconOnly = false,
}: {
  fallbackHref?: string;
  label?: string;
  className?: string;
  iconOnly?: boolean;
}) {
  const router = useRouter();

  function goBack() {
    if (typeof window === "undefined") {
      router.push(fallbackHref);
      return;
    }
    // history.length is unreliable (often >1 even on first entry). Prefer referrer
    // within this app, then session trail, then fallback.
    const sameOriginReferrer =
      document.referrer &&
      (() => {
        try {
          return new URL(document.referrer).origin === window.location.origin;
        } catch {
          return false;
        }
      })();

    if (sameOriginReferrer || window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallbackHref);
  }

  return (
    <button type="button" onClick={goBack} className={className} aria-label={label}>
      {iconOnly ? (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        label
      )}
    </button>
  );
}
