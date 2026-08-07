"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { TemplateRecipientRoleRecord } from "@/lib/types";
import type { AgreementSendMode, RecipientFormInput } from "@/lib/recipientFormUtils";
import {
  AGREEMENT_RECIPIENT_COLORS,
  actionToRecipientType,
  applySendMode,
  createRecipient,
  defaultRecipientRole,
  moveRecipientInList,
  recipientTypeToAction,
  sendModeUsesSigningOrder,
  setRecipientSigningStep,
} from "@/lib/recipientFormUtils";
import TemplateRecipientCard from "@/components/templates/TemplateRecipientCard";
import SigningOrderDiagramModal from "@/components/templates/SigningOrderDiagramModal";
import RecipientCsvImport from "./RecipientCsvImport";
import TemplateRoleBanner from "./TemplateRoleBanner";
import { Icon } from "@/components/Icons";

export default function RecipientList({
  recipients,
  sendMode,
  templateRoles,
  showTemplateRoles,
  onRecipientsChange,
  onSendModeChange,
  senderLabel = "You",
  bulkMode = false,
  forceCsvOpen = false,
  hideManualCards = false,
}: {
  recipients: RecipientFormInput[];
  sendMode: AgreementSendMode;
  templateRoles: TemplateRecipientRoleRecord[];
  showTemplateRoles: boolean;
  onRecipientsChange: (recipients: RecipientFormInput[]) => void;
  onSendModeChange: (mode: AgreementSendMode) => void;
  senderLabel?: string;
  /** Bulk: many people, each gets their own agreement (no shared signing order). */
  bulkMode?: boolean;
  /** Open paste box by default (bulk CSV method). */
  forceCsvOpen?: boolean;
  /** Hide typed recipient cards — CSV/paste only. */
  hideManualCards?: boolean;
}) {
  const [showOrderDiagram, setShowOrderDiagram] = useState(false);
  const signingOrderEnabled = bulkMode ? false : sendModeUsesSigningOrder(sendMode);
  const allowMultiple = bulkMode || sendMode !== "single";

  const diagramRecipients = useMemo(
    () =>
      recipients.map((recipient, index) => ({
        id: recipient.id,
        role: recipient.role || defaultRecipientRole(index),
        name: recipient.name,
        email: recipient.email,
        action: recipient.action || recipientTypeToAction(recipient.recipientType),
      })),
    [recipients]
  );

  function updateRecipient(id: string, patch: Partial<{ role: string; name: string; email: string; action: string }>) {
    onRecipientsChange(
      recipients.map((recipient, index) => {
        if (recipient.id !== id) return recipient;
        const nextAction = patch.action ?? recipient.action ?? recipientTypeToAction(recipient.recipientType);
        const nextType = patch.action ? actionToRecipientType(patch.action) : recipient.recipientType;
        return {
          ...recipient,
          role: patch.role ?? recipient.role ?? defaultRecipientRole(index),
          name: patch.name ?? recipient.name,
          email: patch.email ?? recipient.email,
          action: nextAction,
          recipientType: nextType,
          required: nextType === "receives_copy" || nextType === "view_only" ? false : recipient.required,
        };
      })
    );
  }

  function addRecipient() {
    if (!allowMultiple) return;
    onRecipientsChange(applySendMode(sendMode, [...recipients, createRecipient(recipients.length)]));
  }

  function handleSigningOrderToggle(checked: boolean) {
    const mode: AgreementSendMode = checked ? "sequential" : "group";
    onSendModeChange(mode);
    onRecipientsChange(applySendMode(mode, recipients));
  }

  function handleCsvImport(imported: RecipientFormInput[]) {
    onRecipientsChange(
      applySendMode(
        sendMode,
        imported.map((item, index) => ({
          ...item,
          role: item.role || defaultRecipientRole(index),
          action: item.action || recipientTypeToAction(item.recipientType),
        }))
      )
    );
  }

  function handleRemove(id: string) {
    const next = recipients.filter((recipient) => recipient.id !== id);
    if (!next.length) {
      onRecipientsChange([createRecipient(0)]);
      return;
    }
    onRecipientsChange(applySendMode(sendMode, next));
  }

  function handleMove(id: string, direction: -1 | 1) {
    onRecipientsChange(moveRecipientInList(recipients, id, direction === -1 ? "up" : "down"));
  }

  return (
    <section className="space-y-4">
      {!bulkMode && (
        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex items-center gap-2 text-[15px] text-[#000]">
            <input
              type="checkbox"
              checked={signingOrderEnabled}
              onChange={(event) => handleSigningOrderToggle(event.target.checked)}
              className="h-4 w-4 accent-[#4c00ff]"
            />
            Set signing order
          </label>
          <button
            type="button"
            onClick={() => setShowOrderDiagram(true)}
            className="text-[15px] font-semibold text-[#4c00ff] hover:underline"
          >
            View
          </button>
          <Link href="/documents/new?bulk=1" className="text-[15px] font-semibold text-[#4c00ff] hover:underline">
            Bulk send
          </Link>
          {allowMultiple && (
            <button
              type="button"
              onClick={() => onSendModeChange("single")}
              className="text-[13px] font-semibold text-[#666] hover:text-[#4c00ff]"
            >
              One person only
            </button>
          )}
          {!allowMultiple && (
            <button
              type="button"
              onClick={() => handleSigningOrderToggle(false)}
              className="text-[13px] font-semibold text-[#666] hover:text-[#4c00ff]"
            >
              Multiple recipients
            </button>
          )}
        </div>
      )}
      {bulkMode && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[13px] text-[#666]">
            Add everyone who should receive a copy. Each name becomes a separate agreement in your list.
          </p>
          <Link href="/documents/new" className="text-[13px] font-semibold text-[#4c00ff] hover:underline">
            Exit bulk send
          </Link>
        </div>
      )}

      {showTemplateRoles && !bulkMode && <TemplateRoleBanner roles={templateRoles} recipients={recipients} />}

      {allowMultiple && (bulkMode || sendMode === "group" || sendMode === "sequential") && (
        <div id="recipient-csv-import">
          <RecipientCsvImport
            sendMode={bulkMode ? "group" : sendMode === "sequential" ? "sequential" : "group"}
            onImport={handleCsvImport}
            defaultOpen={forceCsvOpen || bulkMode}
          />
        </div>
      )}

      {!hideManualCards && (
        <div className="space-y-4">
          {recipients.map((recipient, index) => (
            <TemplateRecipientCard
              key={recipient.id}
              recipient={{
                id: recipient.id,
                role: recipient.role || defaultRecipientRole(index),
                name: recipient.name,
                email: recipient.email,
                action: recipient.action || recipientTypeToAction(recipient.recipientType),
              }}
              index={index}
              signingStep={recipient.signingStep}
              onSigningStepChange={
                signingOrderEnabled
                  ? (step) => onRecipientsChange(setRecipientSigningStep(recipients, recipient.id, step))
                  : undefined
              }
              color={AGREEMENT_RECIPIENT_COLORS[index % AGREEMENT_RECIPIENT_COLORS.length]}
              signingOrder={signingOrderEnabled}
              canRemove={allowMultiple && recipients.length > 1}
              onChange={(patch) => updateRecipient(recipient.id, patch)}
              onRemove={() => handleRemove(recipient.id)}
              onMove={(direction) => handleMove(recipient.id, direction)}
            />
          ))}
        </div>
      )}

      {hideManualCards && recipients.some((r) => r.name && r.email) && (
        <div className="rounded border border-[#e8e8e8] bg-[#fafafa] px-4 py-3 text-[13px] text-[#333]">
          <p className="font-semibold text-[#212121]">
            {recipients.filter((r) => r.name && r.email).length} recipient
            {recipients.filter((r) => r.name && r.email).length === 1 ? "" : "s"} ready
          </p>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-[#555]">
            {recipients
              .filter((r) => r.name && r.email)
              .map((r) => (
                <li key={r.id}>
                  {r.name} &lt;{r.email}&gt;
                </li>
              ))}
          </ul>
          <button
            type="button"
            onClick={() => onRecipientsChange([createRecipient(0), createRecipient(1)])}
            className="mt-2 text-[12px] font-semibold text-[#4c00ff] hover:underline"
          >
            Clear list
          </button>
        </div>
      )}

      {allowMultiple && !hideManualCards && (
        <div className="inline-flex overflow-hidden rounded border border-[#c6c6c6] bg-[#f2f2f2]">
          <button
            type="button"
            onClick={addRecipient}
            className="inline-flex h-10 items-center gap-2 px-4 text-[15px] font-semibold text-[#000] hover:bg-[#ebebeb]"
          >
            <Icon name="team" className="h-4 w-4" />
            Add Recipient
          </button>
          <button
            type="button"
            onClick={addRecipient}
            aria-label="More recipient options"
            className="inline-flex h-10 w-10 items-center justify-center border-l border-[#c6c6c6] hover:bg-[#ebebeb]"
          >
            <Icon name="chevron" className="h-4 w-4 rotate-90 text-[#666]" />
          </button>
        </div>
      )}

      {showOrderDiagram && (
        <SigningOrderDiagramModal
          recipients={diagramRecipients}
          senderLabel={senderLabel}
          onClose={() => setShowOrderDiagram(false)}
        />
      )}
    </section>
  );
}
