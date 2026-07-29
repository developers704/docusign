"use client";

import { useEffect, useRef, useState } from "react";
import type { TemplateRecipientRoleRecord } from "@/lib/types";
import type { RecipientFormInput } from "@/lib/recipientFormUtils";
import { RECIPIENT_ACTION_OPTIONS, recipientActionLabel } from "@/lib/recipientFormUtils";

export default function RecipientMoreMenu({
  recipient,
  index,
  signingOrderEnabled,
  templateRoles,
  showTemplateRoles,
  onChange,
  onMove,
  onRemove,
}: {
  recipient: RecipientFormInput;
  index: number;
  signingOrderEnabled: boolean;
  templateRoles: TemplateRecipientRoleRecord[];
  showTemplateRoles: boolean;
  onChange: (patch: Partial<RecipientFormInput>) => void;
  onMove: (direction: "up" | "down") => void;
  onRemove?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [showAdvancedOrder, setShowAdvancedOrder] = useState(false);
  const [showPhone, setShowPhone] = useState(Boolean(recipient.phone));
  const menuRef = useRef<HTMLDivElement>(null);
  const label = recipient.name.trim() || `Recipient ${index + 1}`;
  const phoneVisible = showPhone || Boolean(recipient.phone);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More options for ${label}`}
        onClick={() => setOpen((current) => !current)}
        className="rounded-lg border border-[#ddd5e5] px-2.5 py-2 text-xs font-semibold text-[#4c00ff] hover:bg-[#f7f4fb]"
      >
        More
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-[#e6e0e9] bg-white p-2 shadow-lg"
        >
          <label className="block px-3 py-2">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#948a9e]">Recipient action</span>
            <select
              value={recipient.recipientType}
              onChange={(event) => onChange({ recipientType: event.target.value as RecipientFormInput["recipientType"] })}
              className="w-full rounded-lg border border-[#ddd5e5] px-3 py-2 text-sm"
            >
              {RECIPIENT_ACTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-[#817687]">{recipientActionLabel(recipient.recipientType)}</span>
          </label>

          {showTemplateRoles && templateRoles.length > 0 && (
            <label className="block px-3 py-2">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#948a9e]">Assign template role</span>
              <select
                value={recipient.templateRoleId}
                onChange={(event) => onChange({ templateRoleId: event.target.value })}
                className="w-full rounded-lg border border-[#ddd5e5] px-3 py-2 text-sm"
              >
                <option value="">Choose a role</option>
                {templateRoles.map((role) => (
                  <option key={role.id} value={role.id}>{role.roleName}</option>
                ))}
              </select>
            </label>
          )}

          <label className="flex items-center gap-2 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={!recipient.required}
              onChange={(event) => onChange({ required: !event.target.checked })}
              disabled={recipient.recipientType === "receives_copy" || recipient.recipientType === "view_only"}
            />
            This recipient is optional
          </label>

          {!phoneVisible ? (
            <button
              type="button"
              className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#faf8fc]"
              onClick={() => setShowPhone(true)}
            >
              Add phone number
            </button>
          ) : (
            <label className="block px-3 py-2">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#948a9e]">Phone number</span>
              <input
                type="tel"
                value={recipient.phone}
                onChange={(event) => onChange({ phone: event.target.value })}
                className="w-full rounded-lg border border-[#ddd5e5] px-3 py-2 text-sm"
              />
            </label>
          )}

          {signingOrderEnabled && (
            <div className="border-t border-[#f0ecf2] px-3 py-2">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-lg px-1 py-2 text-left text-sm font-semibold hover:bg-[#faf8fc]"
                onClick={() => setShowAdvancedOrder((current) => !current)}
              >
                Advanced signing order
                <span aria-hidden="true">{showAdvancedOrder ? "−" : "+"}</span>
              </button>
              {showAdvancedOrder && (
                <div className="mt-2 space-y-2">
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs text-[#776c80]">Order number</span>
                    <input
                      type="number"
                      min={1}
                      value={recipient.signingStep}
                      onChange={(event) => onChange({ signingStep: Math.max(1, Number(event.target.value) || 1) })}
                      className="w-full rounded-lg border border-[#ddd5e5] px-3 py-2"
                    />
                  </label>
                  <p className="text-[11px] leading-5 text-[#817687]">
                    Recipients with the same order number receive the agreement at the same time.
                  </p>
                </div>
              )}
            </div>
          )}

          {signingOrderEnabled && (
            <div className="border-t border-[#f0ecf2] px-1 py-1">
              <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#faf8fc]" onClick={() => onMove("up")}>
                Move up
              </button>
              <button type="button" className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#faf8fc]" onClick={() => onMove("down")}>
                Move down
              </button>
            </div>
          )}

          {onRemove && (
            <button
              type="button"
              className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50"
              onClick={onRemove}
            >
              Remove recipient
            </button>
          )}
        </div>
      )}
    </div>
  );
}
