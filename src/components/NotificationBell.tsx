"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  href: string | null;
  envelopeId?: string | null;
  createdAt: string;
  unread: boolean;
  type: string;
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Resolve a full-page URL that works behind cPanel (no Next soft-nav / 0.0.0.0). */
function resolveOpenUrl(item: NotificationItem) {
  if (item.envelopeId) return `/api/open-envelope/${encodeURIComponent(item.envelopeId)}`;

  const href = item.href || "";
  const fromEnvelopes = href.match(/\/envelopes\/([^/?#]+)/);
  if (fromEnvelopes?.[1]) return `/api/open-envelope/${encodeURIComponent(fromEnvelopes[1])}`;

  const fromOpen = href.match(/\/open\/envelope\/([^/?#]+)/);
  if (fromOpen?.[1]) return `/api/open-envelope/${encodeURIComponent(fromOpen[1])}`;

  if (href.startsWith("/")) return href;
  return "/agreements";
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) return;
      const data = (await response.json()) as { items?: NotificationItem[]; unreadCount?: number };
      const next = (Array.isArray(data.items) ? data.items : []).filter((item) => item.unread !== false);
      setItems(next);
      setUnreadCount(Number(data.unreadCount) || next.length);
    } catch {
      // Ignore transient network errors while polling.
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 25_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markAllRead() {
    setLoading(true);
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ids: "all" }),
      });
      setItems([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }

  async function openPanel() {
    setOpen((value) => !value);
    if (!open) await load();
  }

  async function onItemClick(item: NotificationItem) {
    const target = resolveOpenUrl(item);
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ids: [item.id] }),
      });
    } catch {
      /* still navigate */
    }
    setItems((prev) => prev.filter((row) => row.id !== item.id));
    setUnreadCount((count) => Math.max(0, count - 1));
    setOpen(false);
    // Full page load — required on cPanel; Next <Link> soft nav often 404s behind Passenger.
    window.location.assign(target);
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => void openPanel()}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-[#4a4458] hover:bg-[#f0ebff]"
      >
        <Icon name="bell" className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#c00] px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(92vw,360px)] overflow-hidden rounded-xl border border-[#e7e2ec] bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-[#ececec] px-4 py-3">
            <p className="text-[14px] font-bold text-[#21004c]">Notifications</p>
            {unreadCount > 0 ? (
              <button
                type="button"
                disabled={loading}
                onClick={() => void markAllRead()}
                className="text-[12px] font-semibold text-[#4c00ff] hover:underline disabled:opacity-50"
              >
                Mark all read
              </button>
            ) : null}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-[#6b6578]">No unread notifications.</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void onItemClick(item)}
                  className="block w-full border-b border-[#f0f0f0] bg-[#f7f4ff] px-4 py-3 text-left hover:bg-[#fafafa]"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#4c00ff]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-[#21004c]">{item.title}</p>
                      <p className="mt-0.5 text-[12px] leading-snug text-[#4a4458]">{item.message}</p>
                      <p className="mt-1 text-[11px] text-[#9a93a8]">{timeAgo(item.createdAt)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
