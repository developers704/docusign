"use client";

import Link from "next/link";
import { useState } from "react";
import type { TemplateRecipientRoleRecord, TemplateRecord } from "@/lib/types";
import {
  TEMPLATE_ROLE_ACTION_LABELS,
  TEMPLATE_STATUS_LABELS,
  formatTemplateDate,
} from "@/lib/templateFormUtils";
import { UPLOAD_ACCEPT, UPLOAD_HELP_TEXT } from "@/lib/documentImport";

type ServerAction = (formData: FormData) => Promise<void>;

function TemplateRoleList({
  templateId,
  roles,
  moveRoleAction,
}: {
  templateId: string;
  roles: TemplateRecipientRoleRecord[];
  moveRoleAction: ServerAction;
}) {
  const sorted = [...roles].sort((a, b) => a.signingOrder - b.signingOrder);

  return (
    <ul className="space-y-2">
      {sorted.map((role, index) => (
        <li
          key={role.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-[#ece7ef] bg-white px-3 py-2.5"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f3efff] text-xs font-bold text-[#4c00ff]">
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#2b2038]">{role.roleName}</p>
              <p className="text-xs text-[#817687]">{TEMPLATE_ROLE_ACTION_LABELS[role.roleType]}</p>
            </div>
          </div>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-lg border border-[#ddd5e5] px-2.5 py-1.5 text-xs font-semibold text-[#4c00ff] marker:content-none">
              More
            </summary>
            <div className="absolute right-0 z-10 mt-2 w-40 rounded-xl border border-[#e6e0e9] bg-white p-1 shadow-lg">
              <form action={moveRoleAction}>
                <input type="hidden" name="templateId" value={templateId} />
                <input type="hidden" name="roleId" value={role.id} />
                <input type="hidden" name="direction" value="up" />
                <button type="submit" className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#faf8fc]">
                  Move up
                </button>
              </form>
              <form action={moveRoleAction}>
                <input type="hidden" name="templateId" value={templateId} />
                <input type="hidden" name="roleId" value={role.id} />
                <input type="hidden" name="direction" value="down" />
                <button type="submit" className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#faf8fc]">
                  Move down
                </button>
              </form>
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

export default function TemplateCard({
  template,
  officeName,
  showOffice,
  duplicateAction,
  updateStatusAction,
  useTemplateAction,
  uploadPdfAction,
  restoreVersionAction,
  moveRoleAction,
  deleteAction,
  canManage = false,
}: {
  template: TemplateRecord;
  officeName?: string;
  showOffice: boolean;
  duplicateAction: ServerAction;
  updateStatusAction: ServerAction;
  useTemplateAction: ServerAction;
  uploadPdfAction: ServerAction;
  restoreVersionAction: ServerAction;
  moveRoleAction: ServerAction;
  deleteAction?: ServerAction;
  canManage?: boolean;
}) {
  const [manageOpen, setManageOpen] = useState(false);
  const versionNumber =
    template.versions.find((version) => version.id === template.currentVersionId)?.versionNumber || 1;
  const hasPdf = template.documents.length > 0;
  const latestVersions = [...template.versions].sort((a, b) => b.versionNumber - a.versionNumber).slice(0, 3);

  return (
    <article className="rounded-2xl border border-[#e8e2ec] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold text-[#2b2038]">{template.name}</h2>
          <p className="mt-1 text-sm text-[#817687]">
            {template.title} · Updated {formatTemplateDate(template.updatedAt)} · Version {versionNumber}
          </p>
          {showOffice && officeName && <p className="mt-1 text-xs text-[#948a9e]">{officeName}</p>}
        </div>
        <span className="rounded-full bg-[#f3efff] px-3 py-1 text-xs font-semibold text-[#4c00ff]">
          {TEMPLATE_STATUS_LABELS[template.status]}
        </span>
      </div>

      {template.description && <p className="mt-3 text-sm text-[#62566e]">{template.description}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <form action={useTemplateAction}>
          <input type="hidden" name="templateId" value={template.id} />
          <button
            type="submit"
            className="rounded-xl bg-[#4c00ff] px-4 py-2 text-sm font-bold text-white"
            title="Creates an agreement and publishes this template automatically"
          >
            Use template
          </button>
        </form>
        {canManage && (
          <Link
            href={`/templates/${template.id}/edit`}
            className="rounded-xl border border-[#ddd5e5] px-4 py-2 text-sm font-semibold"
          >
            Edit
          </Link>
        )}
        <form action={duplicateAction}>
          <input type="hidden" name="templateId" value={template.id} />
          <button type="submit" className="rounded-xl border border-[#ddd5e5] px-4 py-2 text-sm font-semibold">
            Duplicate
          </button>
        </form>
        <button
          type="button"
          onClick={() => setManageOpen((open) => !open)}
          className="rounded-xl border border-[#ddd5e5] px-4 py-2 text-sm font-semibold text-[#4c00ff]"
        >
          {manageOpen ? "Hide details" : "Manage template"}
        </button>
        {deleteAction && (
          <form
            action={deleteAction}
            onSubmit={(event) => {
              if (!window.confirm(`Delete "${template.name}"? This permanently removes the template and cannot be undone.`)) {
                event.preventDefault();
              }
            }}
          >
            <input type="hidden" name="templateId" value={template.id} />
            <button type="submit" className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">
              Delete
            </button>
          </form>
        )}
      </div>

      {template.recipientRoles.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#948a9e]">Recipient roles</p>
          <div className="mt-2">
            <TemplateRoleList templateId={template.id} roles={template.recipientRoles} moveRoleAction={moveRoleAction} />
          </div>
        </div>
      )}

      {manageOpen && (
        <div className="mt-4 space-y-4 border-t border-[#f0ecf2] pt-4">
          <section>
            <p className="text-sm font-semibold text-[#2b2038]">Template document</p>
            <p className="mt-1 text-xs text-[#817687]">
              {hasPdf ? "A document is attached to this template." : `Upload a document for this template. ${UPLOAD_HELP_TEXT}`}
            </p>
            <form action={uploadPdfAction} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input type="hidden" name="templateId" value={template.id} />
              <input type="hidden" name="mode" value="append" />
              <input
                name="documentFiles"
                type="file"
                accept={UPLOAD_ACCEPT}
                multiple
                className="w-full rounded-lg border border-dashed border-[#c8bfd3] bg-[#faf9fc] px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[#4c00ff] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
              />
              <button type="submit" className="rounded-xl bg-[#2b2038] px-4 py-2 text-sm font-semibold text-white">
                Add documents
              </button>
            </form>
          </section>

          {template.message && (
            <section>
              <p className="text-sm font-semibold text-[#2b2038]">Email message</p>
              <p className="mt-1 text-sm text-[#62566e]">{template.message}</p>
            </section>
          )}

          {latestVersions.length > 0 && (
            <section>
              <p className="text-sm font-semibold text-[#2b2038]">Version history</p>
              <ul className="mt-2 space-y-2">
                {latestVersions.map((version) => (
                  <li key={version.id} className="flex items-center justify-between rounded-lg bg-[#faf9fc] px-3 py-2">
                    <span className="text-xs text-[#62566e]">
                      Version {version.versionNumber}
                      {version.isCurrent ? " · Current" : ""}
                    </span>
                    {!version.isCurrent && (
                      <form action={restoreVersionAction}>
                        <input type="hidden" name="templateId" value={template.id} />
                        <input type="hidden" name="versionId" value={version.id} />
                        <button type="submit" className="text-xs font-semibold text-[#4c00ff]">
                          Restore
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {template.status !== "archived" ? (
            <form action={updateStatusAction}>
              <input type="hidden" name="templateId" value={template.id} />
              <input type="hidden" name="status" value="archived" />
              <button type="submit" className="text-sm font-semibold text-red-700">
                Archive template
              </button>
            </form>
          ) : (
            <form action={updateStatusAction}>
              <input type="hidden" name="templateId" value={template.id} />
              <input type="hidden" name="status" value="draft" />
              <button type="submit" className="text-sm font-semibold text-[#4c00ff]">
                Restore template
              </button>
            </form>
          )}
        </div>
      )}
    </article>
  );
}
