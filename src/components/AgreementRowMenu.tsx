"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icons";
import type { EnvelopeRecord } from "@/lib/types";

type MenuItem = {
  id: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void | Promise<void>;
};

type MenuPos = { top: number; left: number; maxHeight: number; place: "up" | "down" | "sheet" };

const MENU_WIDTH = 224;

export default function AgreementRowMenu({
  envelope,
  canDelete = false,
  canCreate = true,
}: {
  envelope: EnvelopeRecord;
  canDelete?: boolean;
  canCreate?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  function measure() {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isNarrow = vw < 640;

    if (isNarrow) {
      setPos({ top: 0, left: 0, maxHeight: Math.min(vh * 0.7, 420), place: "sheet" });
      return;
    }

    const spaceBelow = vh - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const preferDown = spaceBelow >= 220 || spaceBelow >= spaceAbove;
    const maxHeight = Math.max(160, preferDown ? spaceBelow : spaceAbove);
    const left = Math.min(Math.max(8, rect.right - MENU_WIDTH), vw - MENU_WIDTH - 8);
    if (preferDown) {
      setPos({ top: rect.bottom + 6, left, maxHeight, place: "down" });
    } else {
      setPos({ top: Math.max(8, rect.top - 6), left, maxHeight, place: "up" });
    }
  }

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    measure();
    function onResize() {
      measure();
    }
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
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    if (window.innerWidth < 640) document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  async function run(url: string, redirectTo?: string) {
    setBusy(true);
    try {
      const response = await fetch(url, { method: "POST" });
      const data = (await response.json()) as {
        error?: string;
        envelopeId?: string;
        templateId?: string;
      };
      if (!response.ok) {
        window.alert(data.error || "Action failed.");
        return;
      }
      setOpen(false);
      if (redirectTo) {
        router.push(redirectTo);
        router.refresh();
        return;
      }
      if (data.envelopeId) {
        router.push(`/documents/new?draft=${data.envelopeId}`);
        router.refresh();
        return;
      }
      if (data.templateId) {
        router.push(`/templates/${data.templateId}/edit`);
        router.refresh();
        return;
      }
      router.refresh();
    } catch {
      window.alert("Connection error.");
    } finally {
      setBusy(false);
    }
  }

  function printDocument() {
    const url = `/api/admin/envelopes/${envelope.id}/document`;
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (!win) {
      window.alert("Allow pop-ups to print this document.");
      return;
    }
    window.setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch {
        /* ignore */
      }
    }, 800);
    setOpen(false);
  }

  function exportCsv() {
    const rows = [
      ["Field", "Value"],
      ["Title", envelope.title],
      ["Envelope", envelope.envelopeNumber],
      ["Status", envelope.status],
      ["Office", envelope.officeName],
      ["Created", envelope.createdAt],
      ["Completed", envelope.completedAt || ""],
      ...envelope.recipients.flatMap((recipient, index) => [
        [`Recipient ${index + 1} name`, recipient.name],
        [`Recipient ${index + 1} email`, recipient.email],
        [`Recipient ${index + 1} status`, recipient.status],
      ]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `${envelope.envelopeNumber || envelope.id}.csv`;
    link.click();
    URL.revokeObjectURL(href);
    setOpen(false);
  }

  async function deleteAgreement() {
    if (
      !window.confirm(
        `Delete "${envelope.title}" permanently? Documents and signing links will be removed.`
      )
    ) {
      return;
    }
    await run(`/api/admin/envelopes/${envelope.id}/delete`, "/agreements");
  }

  const items: MenuItem[] = [
    { id: "print", label: "Print", onClick: printDocument },
    { id: "add-folder", label: "Add to folder", disabled: true, onClick: () => undefined },
    {
      id: "forward",
      label: "Forward",
      disabled: !canCreate,
      onClick: () => run(`/api/admin/envelopes/${envelope.id}/copy`),
    },
    {
      id: "copy",
      label: "Copy",
      disabled: !canCreate,
      onClick: () => run(`/api/admin/envelopes/${envelope.id}/copy`),
    },
    {
      id: "save-template",
      label: "Save as Template",
      disabled: !canCreate,
      onClick: () => run(`/api/admin/envelopes/${envelope.id}/save-as-template`),
    },
    {
      id: "history",
      label: "History",
      onClick: () => {
        setOpen(false);
        router.push(`/envelopes/${envelope.id}`);
      },
    },
    { id: "transfer", label: "Transfer Ownership", disabled: true, onClick: () => undefined },
    { id: "export", label: "Export as CSV", onClick: exportCsv },
  ];

  if (canDelete) {
    items.push({ id: "delete", label: "Delete", danger: true, onClick: deleteAgreement });
  }

  const menu =
    open && pos && mounted
      ? createPortal(
          pos.place === "sheet" ? (
            <div className="fixed inset-0 z-[80] flex flex-col justify-end sm:hidden" role="presentation">
              <button
                type="button"
                aria-label="Close menu"
                className="absolute inset-0 bg-black/35"
                onClick={() => setOpen(false)}
              />
              <div
                ref={menuRef}
                role="menu"
                className="relative z-10 max-h-[70vh] overflow-y-auto rounded-t-2xl border border-[#e7e2ec] bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl"
              >
                <div className="sticky top-0 border-b border-[#eee] bg-white px-4 py-3">
                  <p className="truncate text-[13px] font-semibold text-[#1c1230]">{envelope.title}</p>
                </div>
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    disabled={busy || item.disabled}
                    onClick={() => void item.onClick()}
                    className={`block w-full px-4 py-3.5 text-left text-[15px] font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                      item.danger ? "text-[#b00020] hover:bg-[#fff5f5]" : "text-[#21004c] hover:bg-[#f7f4fb]"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div
              ref={menuRef}
              role="menu"
              style={{
                position: "fixed",
                top: pos.place === "down" ? pos.top : undefined,
                bottom: pos.place === "up" ? window.innerHeight - pos.top : undefined,
                left: pos.left,
                width: MENU_WIDTH,
                maxHeight: pos.maxHeight,
              }}
              className="z-[80] overflow-y-auto rounded-[4px] border border-[#d8d0e0] bg-white py-1 shadow-[0_8px_24px_rgba(28,18,48,.18)]"
            >
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  disabled={busy || item.disabled}
                  onClick={() => void item.onClick()}
                  className={`block w-full px-4 py-2.5 text-left text-[14px] font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                    item.danger ? "text-[#b00020] hover:bg-[#fff5f5]" : "text-[#21004c] hover:bg-[#f7f4fb]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ),
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More actions for ${envelope.title}`}
        disabled={busy}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-[2px] border border-[#c6c6c6] bg-[#f7f7f7] text-[#1c1230] hover:bg-[#eee] disabled:opacity-50"
      >
        <Icon name="moreVertical" className="h-4 w-4" />
      </button>
      {menu}
    </>
  );
}
