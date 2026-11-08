"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icons";

/** Compact actions: primary buttons + overflow menu (portal) so Delete never clips. */
export default function PublishedFormRowActions({
  kind,
  id,
  name,
  canManage,
}: {
  kind: "powerform" | "webform";
  id: string;
  name: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; place: "up" | "down" | "sheet" } | null>(
    null
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isPowerForm = kind === "powerform";
  const duplicateHref = isPowerForm
    ? `/api/admin/powerforms/${id}/duplicate`
    : `/api/admin/webforms/${id}/duplicate`;
  const deleteHref = isPowerForm ? `/api/admin/powerforms/${id}` : `/api/admin/webforms/${id}`;

  useEffect(() => setMounted(true), []);

  function measure() {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (vw < 640) {
      setCoords({ top: 0, left: 0, place: "sheet" });
      return;
    }
    const spaceBelow = vh - rect.bottom;
    const place = spaceBelow < 140 ? "up" : "down";
    const left = Math.min(Math.max(8, rect.right - 176), vw - 184);
    setCoords({
      top: place === "down" ? rect.bottom + 6 : Math.max(8, rect.top - 6),
      left,
      place,
    });
  }

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    measure();
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  if (!canManage) return <span className="text-[13px] text-[#999]">—</span>;

  async function duplicate() {
    setBusy(true);
    try {
      const response = await fetch(duplicateHref, { method: "POST" });
      const data = (await response.json()) as { error?: string; id?: string };
      if (!response.ok || !data.id) {
        window.alert(data.error || "Unable to duplicate.");
        return;
      }
      setOpen(false);
      if (isPowerForm) router.push(`/powerforms/edit/${data.id}`);
      router.refresh();
    } catch {
      window.alert("Unable to duplicate.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete “${name}”? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const response = await fetch(deleteHref, { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        window.alert(data.error || "Unable to delete.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      window.alert("Unable to delete.");
    } finally {
      setBusy(false);
    }
  }

  const overflowItems = (
    <>
      {isPowerForm ? (
        <button
          type="button"
          role="menuitem"
          disabled={busy}
          onClick={() => void duplicate()}
          className="block w-full px-4 py-2.5 text-left text-[14px] font-medium text-[#21004c] hover:bg-[#f7f4fb] disabled:opacity-50"
        >
          Duplicate
        </button>
      ) : null}
      <button
        type="button"
        role="menuitem"
        disabled={busy}
        onClick={() => void remove()}
        className="block w-full px-4 py-2.5 text-left text-[14px] font-medium text-[#b00020] hover:bg-[#fff5f5] disabled:opacity-50"
      >
        Delete
      </button>
    </>
  );

  const menu =
    open && coords && mounted
      ? createPortal(
          coords.place === "sheet" ? (
            <div className="fixed inset-0 z-[80] flex flex-col justify-end sm:hidden">
              <button type="button" aria-label="Close" className="absolute inset-0 bg-black/35" onClick={() => setOpen(false)} />
              <div ref={menuRef} role="menu" className="relative z-10 rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl">
                <div className="border-b border-[#eee] px-4 py-3 text-[13px] font-semibold">{name}</div>
                {overflowItems}
              </div>
            </div>
          ) : (
            <div
              ref={menuRef}
              role="menu"
              style={{
                position: "fixed",
                top: coords.place === "down" ? coords.top : undefined,
                bottom: coords.place === "up" ? window.innerHeight - coords.top : undefined,
                left: coords.left,
                width: 176,
              }}
              className="z-[80] rounded-[4px] border border-[#d8d0e0] bg-white py-1 shadow-[0_8px_24px_rgba(28,18,48,.18)]"
            >
              {overflowItems}
            </div>
          ),
          document.body
        )
      : null;

  return (
    <div className="flex flex-nowrap items-center justify-end gap-2">
      {isPowerForm ? (
        <>
          <Link
            href={`/powerforms/edit/${id}`}
            className="inline-flex h-8 shrink-0 items-center rounded-[2px] border border-[#c6c6c6] bg-white px-3 text-[12px] font-semibold text-[#21004c] hover:bg-[#f5f5f5]"
          >
            Edit
          </Link>
          <Link
            href={`/powerforms/manage/${id}`}
            className="inline-flex h-8 shrink-0 items-center rounded-[2px] bg-[#4c00ff] px-3 text-[12px] font-semibold text-white hover:bg-[#3d00cf]"
          >
            Submissions
          </Link>
        </>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void duplicate()}
          className="inline-flex h-8 shrink-0 items-center rounded-[2px] border border-[#c6c6c6] bg-white px-3 text-[12px] font-semibold text-[#21004c] hover:bg-[#f5f5f5] disabled:opacity-50"
        >
          Duplicate
        </button>
      )}

      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More actions for ${name}`}
        disabled={busy}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] border border-[#c6c6c6] bg-[#f7f7f7] text-[#21004c] hover:bg-[#eee] disabled:opacity-50"
      >
        <Icon name="moreVertical" className="h-4 w-4" />
      </button>
      {menu}
    </div>
  );
}
