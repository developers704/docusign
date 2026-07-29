"use client";

import type { DragEvent } from "react";
import type { TemplateRecipientRoleRecord } from "@/lib/types";
import type { RecipientFormInput } from "@/lib/recipientFormUtils";
import { recipientActionLabel } from "@/lib/recipientFormUtils";
import RecipientMoreMenu from "./RecipientMoreMenu";

export default function RecipientRow({
  recipient,
  index,
  signingOrderEnabled,
  templateRoles,
  showTemplateRoles,
  draggable,
  onChange,
  onMove,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  recipient: RecipientFormInput;
  index: number;
  signingOrderEnabled: boolean;
  templateRoles: TemplateRecipientRoleRecord[];
  showTemplateRoles: boolean;
  draggable: boolean;
  onChange: (patch: Partial<RecipientFormInput>) => void;
  onMove: (direction: "up" | "down") => void;
  onRemove?: () => void;
  onDragStart: () => void;
  onDragOver: (event: DragEvent) => void;
  onDrop: () => void;
}) {
  const label = recipient.name.trim() || `Recipient ${index + 1}`;
  const assignedRole = templateRoles.find((role) => role.id === recipient.templateRoleId);

  return (
    <div
      className="rounded-xl border border-[#e8e2ec] bg-white px-3 py-3 sm:px-4"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className={`grid items-start gap-3 ${signingOrderEnabled ? "sm:grid-cols-[auto_1fr_1fr_auto]" : "sm:grid-cols-[1fr_1fr_auto]"}`}>
        {signingOrderEnabled ? (
          <div className="flex items-center gap-2 pt-7 sm:pt-8">
            <button
              type="button"
              aria-label={`Drag ${label}`}
              className="hidden cursor-grab rounded border border-[#e6e0e9] px-1.5 py-2 text-[#948a9e] sm:inline-flex"
              tabIndex={-1}
            >
              ⋮⋮
            </button>
            <span
              aria-label={`Recipient order ${recipient.signingStep}`}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f3efff] text-sm font-bold text-[#4c00ff]"
            >
              {recipient.signingStep}
            </span>
          </div>
        ) : (
          <span className="sr-only">Recipient {index + 1}</span>
        )}

        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-semibold text-[#776c80]">Name</span>
          <input
            value={recipient.name}
            onChange={(event) => onChange({ name: event.target.value })}
            required
            placeholder="Full name"
            className="h-10 w-full rounded-lg border border-[#ddd5e5] px-3 text-sm outline-none focus:border-[#7d52ff] focus:ring-2 focus:ring-[#ece4ff]"
          />
        </label>

        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-semibold text-[#776c80]">Email</span>
          <input
            type="email"
            value={recipient.email}
            onChange={(event) => onChange({ email: event.target.value })}
            required
            placeholder="name@company.com"
            className="h-10 w-full rounded-lg border border-[#ddd5e5] px-3 text-sm outline-none focus:border-[#7d52ff] focus:ring-2 focus:ring-[#ece4ff]"
          />
        </label>

        <div className="flex items-end gap-2 pt-1 sm:pt-7">
          <RecipientMoreMenu
            recipient={recipient}
            index={index}
            signingOrderEnabled={signingOrderEnabled}
            templateRoles={templateRoles}
            showTemplateRoles={showTemplateRoles}
            onChange={onChange}
            onMove={onMove}
            onRemove={onRemove}
          />
          {onRemove && (
            <button
              type="button"
              aria-label={`Remove ${label}`}
              onClick={onRemove}
              className="rounded-lg px-2.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {(assignedRole || recipient.recipientType !== "signer" || !recipient.required || recipient.phone) && (
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[#776c80]">
          {assignedRole && showTemplateRoles && (
            <span className="rounded-full bg-[#f3efff] px-2.5 py-1 font-semibold text-[#4c00ff]">Role: {assignedRole.roleName}</span>
          )}
          {recipient.recipientType !== "signer" && (
            <span className="rounded-full bg-[#f5f2f7] px-2.5 py-1">{recipientActionLabel(recipient.recipientType)}</span>
          )}
          {!recipient.required && (
            <span className="rounded-full bg-[#f5f2f7] px-2.5 py-1">Optional</span>
          )}
          {recipient.phone && (
            <span className="rounded-full bg-[#f5f2f7] px-2.5 py-1">Phone added</span>
          )}
        </div>
      )}
    </div>
  );
}
