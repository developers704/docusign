"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icons";

export default function StartMenuButton({ onNavigate }: { onNavigate?: () => void }) {
  const [open, setOpen] = useState(false);
  const [envelopesOpen, setEnvelopesOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false);
        setEnvelopesOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setEnvelopesOpen(false);
      }
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function close() {
    setOpen(false);
    setEnvelopesOpen(false);
    onNavigate?.();
  }

  return (
    <div
      className="relative"
      ref={ref}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        setOpen(false);
        setEnvelopesOpen(false);
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 w-full items-center justify-between rounded bg-gradient-to-b from-[#5a1aff] to-[#4c00ff] px-4 text-[15px] font-bold tracking-wide text-white shadow-[0_1px_2px_rgba(0,0,0,.18)] transition hover:from-[#4c00ff] hover:to-[#3d00cf] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4c00ff]/40"
      >
        <span className="inline-flex items-center gap-2">
          <Icon name="plus" className="h-4 w-4" />
          START
        </span>
        <Icon name="chevron" className={`h-4 w-4 text-white/90 transition ${open ? "-rotate-90" : "rotate-90"}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 right-0 z-50 mt-0 overflow-visible rounded border border-[#d8d8d8] bg-white py-1 shadow-[0_8px_24px_rgba(0,0,0,.16)]"
        >
          <div
            className="relative"
            onMouseEnter={() => setEnvelopesOpen(true)}
            onMouseLeave={() => setEnvelopesOpen(false)}
          >
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[14px] font-semibold text-[#212121] hover:bg-[#f2f2f2]"
            >
              <span className="inline-flex items-center gap-3">
                <Icon name="send" className="h-4 w-4 text-[#4c00ff]" />
                Contracts
              </span>
              <Icon name="chevron" className="h-3.5 w-3.5 rotate-90 text-[#888]" />
            </button>
            {envelopesOpen && (
              <div className="absolute left-full top-0 z-50 ml-0 min-w-[200px] rounded border border-[#d8d8d8] bg-white py-1 shadow-lg">
                <Link
                  href="/documents/new"
                  role="menuitem"
                  onClick={close}
                  className="block px-4 py-2.5 text-[14px] font-semibold text-[#212121] hover:bg-[#f2f2f2]"
                >
                  Send a contract
                </Link>
                <Link
                  href="/documents/new"
                  role="menuitem"
                  onClick={close}
                  className="block px-4 py-2.5 text-[14px] font-semibold text-[#212121] hover:bg-[#f2f2f2]"
                >
                  Sign a Document
                </Link>
                <Link
                  href="/templates"
                  role="menuitem"
                  onClick={close}
                  className="block px-4 py-2.5 text-[14px] font-semibold text-[#212121] hover:bg-[#f2f2f2]"
                >
                  Use a Template
                </Link>
              </div>
            )}
          </div>
          <Link
            href="/powerforms"
            role="menuitem"
            onClick={close}
            className="flex items-center gap-3 px-4 py-2.5 text-[14px] font-semibold text-[#212121] hover:bg-[#f2f2f2]"
          >
            <Icon name="sparkle" className="h-4 w-4 text-[#4c00ff]" />
            Create PowerForm
          </Link>
          <Link
            href="/documents/new?bulk=1"
            role="menuitem"
            onClick={close}
            className="flex items-center gap-3 px-4 py-2.5 text-[14px] font-semibold text-[#212121] hover:bg-[#f2f2f2]"
          >
            <Icon name="team" className="h-4 w-4 text-[#4c00ff]" />
            Bulk send
          </Link>
          <Link
            href="/templates?create=1"
            role="menuitem"
            onClick={close}
            className="flex items-center gap-3 border-t border-[#eee] px-4 py-2.5 text-[14px] font-semibold text-[#212121] hover:bg-[#f2f2f2]"
          >
            <Icon name="template" className="h-4 w-4 text-[#4c00ff]" />
            Create a Template
          </Link>
        </div>
      )}
    </div>
  );
}
