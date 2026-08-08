"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { TemplateFolderRecord, TemplateRecord } from "@/lib/types";
import { Icon } from "@/components/Icons";
import {
  CreatePowerFormModal,
  CreateWebFormModal,
  MoveToFolderModal,
  ShareToFoldersModal,
  TemplateHistoryModal,
} from "@/components/templates/TemplateActionModals";
import { templateHasSigningFields } from "@/lib/templateSigningFields";

type ServerAction = (formData: FormData) => Promise<void>;

function MenuButton({
  children,
  onClick,
  danger,
  disabled,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`block w-full px-4 py-2.5 text-left text-[14px] hover:bg-[#f2f2f2] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent ${
        danger ? "text-[#b00020]" : "text-[#000]"
      }`}
    >
      {children}
    </button>
  );
}

type ModalKind = "history" | "move" | "share" | "powerform" | "webform" | null;

export default function TemplateRowActions({
  template,
  canManage,
  ownerLabel,
  folders,
  powerFormCount,
  duplicateAction,
  updateStatusAction,
  useTemplateAction,
  deleteAction,
  matchingAction,
  moveAction,
  shareAction,
  createFolderAction,
  createPowerFormAction,
  createWebFormAction,
  downloadHref,
}: {
  template: TemplateRecord;
  canManage: boolean;
  ownerLabel: string;
  folders: TemplateFolderRecord[];
  powerFormCount: number;
  duplicateAction: ServerAction;
  updateStatusAction: ServerAction;
  useTemplateAction: ServerAction;
  deleteAction?: ServerAction;
  matchingAction: ServerAction;
  moveAction: ServerAction;
  shareAction: ServerAction;
  createFolderAction: ServerAction;
  createPowerFormAction: ServerAction;
  createWebFormAction: ServerAction;
  downloadHref: string;
}) {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const canCreatePublishedForm = templateHasSigningFields(template);

  useEffect(() => {
    if (!open) return;
    function place() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const maxH = Math.min(420, window.innerHeight - 16);
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const openUp = spaceBelow < 220 && rect.top > spaceBelow;
      if (openUp) {
        setMenuPos({
          top: Math.max(8, rect.top - Math.min(maxH, rect.top - 8)),
          right: Math.max(8, window.innerWidth - rect.right),
        });
      } else {
        setMenuPos({
          top: rect.bottom + 4,
          right: Math.max(8, window.innerWidth - rect.right),
        });
      }
    }
    place();
    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node) && !buttonRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  const itemClass = "block w-full px-4 py-2.5 text-left text-[14px] text-[#000] hover:bg-[#f2f2f2]";

  function openModal(kind: ModalKind) {
    setOpen(false);
    setModal(kind);
  }

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        <form action={useTemplateAction}>
          <input type="hidden" name="templateId" value={template.id} />
          <button
            type="submit"
            className="inline-flex h-8 min-w-[64px] items-center justify-center rounded-[2px] bg-[#4c00ff] px-4 text-[13px] font-semibold text-white hover:bg-[#3d00cf]"
            title="Creates a contract and publishes this template automatically"
          >
            Use
          </button>
        </form>

        <div className="relative">
          <button
            ref={buttonRef}
            type="button"
            aria-label={`More actions for ${template.name}`}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[2px] text-[#4a4a4a] hover:bg-[#f2f2f2]"
          >
            <Icon name="moreVertical" className="h-[18px] w-[18px]" />
          </button>

          {open && menuPos && (
            <div
              ref={menuRef}
              className="fixed z-[70] max-h-[min(70vh,420px)] w-[220px] overflow-y-auto rounded-[2px] border border-[#d8d8d8] bg-white py-1 shadow-[0_8px_24px_rgba(0,0,0,.18)]"
              style={{ top: menuPos.top, right: menuPos.right }}
            >
              <Link href={`/templates/${template.id}/edit`} className={itemClass} onClick={() => setOpen(false)}>
                Edit
              </Link>
              <MenuButton onClick={() => openModal("move")}>Move</MenuButton>
              <MenuButton onClick={() => openModal("share")}>Share to Folders</MenuButton>
              {canManage && (
                <form action={duplicateAction}>
                  <input type="hidden" name="templateId" value={template.id} />
                  <button type="submit" className={itemClass}>
                    Copy
                  </button>
                </form>
              )}
              <MenuButton
                onClick={() => {
                  if (!canCreatePublishedForm) return;
                  setOpen(false);
                  window.location.href = `/powerforms/new?template=${encodeURIComponent(template.id)}`;
                }}
                disabled={!canCreatePublishedForm}
                title={
                  canCreatePublishedForm
                    ? undefined
                    : "Add Signature or Initial fields on this template first"
                }
              >
                Create PowerForm
              </MenuButton>
              <MenuButton
                onClick={() => {
                  if (!canCreatePublishedForm) return;
                  openModal("webform");
                }}
                disabled={!canCreatePublishedForm}
                title={
                  canCreatePublishedForm
                    ? undefined
                    : "Add Signature or Initial fields on this template first"
                }
              >
                Create Web Form
              </MenuButton>
              {canManage && (
                <form action={matchingAction}>
                  <input type="hidden" name="templateId" value={template.id} />
                  <input type="hidden" name="matchingEligible" value={template.matchingEligible ? "0" : "1"} />
                  <button type="submit" className={itemClass}>
                    {template.matchingEligible ? "Exclude from Matching" : "Include in Matching"}
                  </button>
                </form>
              )}
              {canManage && deleteAction && (
                <form action={deleteAction}>
                  <input type="hidden" name="templateId" value={template.id} />
                  <button type="submit" className={`${itemClass} text-[#b00020]`}>
                    Delete
                  </button>
                </form>
              )}
              <a href={downloadHref} className={itemClass} onClick={() => setOpen(false)}>
                Download
              </a>
              <MenuButton onClick={() => openModal("history")}>History</MenuButton>
              <MenuButton onClick={() => setOpen(false)}>Share with Users</MenuButton>
              <MenuButton onClick={() => setOpen(false)}>Transfer Ownership</MenuButton>
              {canManage && template.status === "published" && (
                <>
                  <div className="my-1 border-t border-[#ececec]" />
                  <form action={updateStatusAction}>
                    <input type="hidden" name="templateId" value={template.id} />
                    <input type="hidden" name="status" value="archived" />
                    <button type="submit" className={itemClass}>
                      Archive
                    </button>
                  </form>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {modal === "history" && (
        <TemplateHistoryModal template={template} ownerLabel={ownerLabel} onClose={() => setModal(null)} />
      )}
      {modal === "move" && (
        <MoveToFolderModal
          template={template}
          folders={folders}
          moveAction={moveAction}
          createFolderAction={createFolderAction}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "share" && (
        <ShareToFoldersModal template={template} folders={folders} shareAction={shareAction} onClose={() => setModal(null)} />
      )}
      {modal === "powerform" && (
        <CreatePowerFormModal template={template} createAction={createPowerFormAction} onClose={() => setModal(null)} />
      )}
      {modal === "webform" && (
        <CreateWebFormModal template={template} createAction={createWebFormAction} onClose={() => setModal(null)} />
      )}

      {powerFormCount > 0 && <span className="sr-only">{powerFormCount} PowerForms</span>}
    </>
  );
}
