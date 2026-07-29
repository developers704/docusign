"use client";

import { useState } from "react";
import { Icon } from "@/components/Icons";

export default function LogoutButton({
  className,
  label = "Log out",
  fullWidth = false,
}: {
  className?: string;
  label?: string;
  fullWidth?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function onLogout() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        redirect: "manual",
      });
    } catch {
      /* still clear session locally and leave */
    }
    // Always navigate on the public host the user is already viewing — never follow 0.0.0.0 redirects.
    window.location.assign("/login");
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void onLogout()}
      className={
        className ||
        (fullWidth
          ? "inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-[#e7e2ec] bg-white text-[15px] font-semibold text-[#21004c] disabled:opacity-60"
          : "inline-flex h-8 items-center gap-1 rounded border border-[#e7e2ec] bg-white px-2.5 text-[12px] font-semibold text-[#21004c] hover:bg-[#f0ebff] disabled:opacity-60")
      }
    >
      <Icon name="logout" className={fullWidth ? "h-4 w-4" : "h-3.5 w-3.5"} />
      {busy ? "Signing out…" : label}
    </button>
  );
}
