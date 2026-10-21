"use client";

import { useMemo, useState } from "react";
import type { TemplateFolderRecord, TemplateRecord } from "@/lib/types";
import { templateHasSigningFields } from "@/lib/templateSigningFields";
import DocuSignModal from "@/components/templates/DocuSignModal";
import { Icon } from "@/components/Icons";

type ServerAction = (formData: FormData) => Promise<void>;

function formatHistoryTime(value: string) {
  const date = new Date(value);
  return `${date.toLocaleDateString("en-US")} | ${date.toLocaleTimeString("en-US")}`;
}

export function TemplateHistoryModal({
  template,
  ownerLabel,
  onClose,
}: {
  template: TemplateRecord;
  ownerLabel: string;
  onClose: () => void;
}) {
  const activities = useMemo(() => {
    const rows: Array<{ time: string; user: string; action: string }> = [
      {
        time: formatHistoryTime(template.createdAt),
        user: `${ownerLabel} (English (US))`,
        action: "Created",
      },
    ];
    for (const version of [...(template.versions || [])].sort((a, b) => a.versionNumber - b.versionNumber)) {
      if (version.versionNumber <= 1) continue;
      rows.push({
        time: formatHistoryTime(version.createdAt),
        user: `${ownerLabel} (English (US))`,
        action: version.changeSummary || `Edited (v${version.versionNumber})`,
      });
    }
    if (template.publishedAt) {
      rows.push({
        time: formatHistoryTime(template.publishedAt),
        user: `${ownerLabel} (English (US))`,
        action: "Published",
      });
    }
    if (template.archivedAt) {
      rows.push({
        time: formatHistoryTime(template.archivedAt),
        user: `${ownerLabel} (English (US))`,
        action: "Archived",
      });
    }
    return rows.reverse();
  }, [ownerLabel, template]);

  return (
    <DocuSignModal
      title="Template History"
      wide
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={() => window.print()}
          className="h-9 rounded-[2px] border border-[#c6c6c6] bg-white px-4 text-[13px] font-semibold text-[#000] hover:bg-[#f5f5f5]"
        >
          Print
        </button>
      }
    >
      <section>
        <h3 className="text-[16px] font-semibold text-[#000]">Details</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#666]">Subject</p>
            <p className="mt-1 text-[14px] text-[#000]">{template.name}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#666]">Owner</p>
            <p className="mt-1 text-[14px] text-[#000]">{ownerLabel}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#666]">Template ID</p>
            <p className="mt-1 break-all text-[14px] text-[#000]">{template.id}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#666]">Location</p>
            <p className="mt-1 text-[14px] text-[#000]">Online</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#666]">Time Zone</p>
            <p className="mt-1 text-[14px] text-[#000]">My computer&apos;s time zone</p>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <h3 className="text-[16px] font-semibold text-[#000]">Activities</h3>
        <div className="mt-3 overflow-hidden rounded-[2px] border border-[#e0e0e0]">
          <table className="w-full border-collapse text-left text-[14px]">
            <thead className="bg-[#fafafa] text-[12px] font-semibold text-[#666]">
              <tr>
                <th className="border-b border-r border-[#e0e0e0] px-3 py-2">Time</th>
                <th className="border-b border-r border-[#e0e0e0] px-3 py-2">User</th>
                <th className="border-b border-[#e0e0e0] px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((row, index) => (
                <tr key={`${row.time}-${index}`}>
                  <td className="border-b border-r border-[#e0e0e0] px-3 py-2.5 text-[#000]">{row.time}</td>
                  <td className="border-b border-r border-[#e0e0e0] px-3 py-2.5 text-[#000]">{row.user}</td>
                  <td className="border-b border-[#e0e0e0] px-3 py-2.5 text-[#000]">{row.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </DocuSignModal>
  );
}

export function MoveToFolderModal({
  template,
  folders,
  moveAction,
  createFolderAction,
  onClose,
}: {
  template: TemplateRecord;
  folders: TemplateFolderRecord[];
  moveAction: ServerAction;
  createFolderAction: ServerAction;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(template.folderIds?.[0] || folders[0]?.id || "");
  const [newFolderName, setNewFolderName] = useState("");
  const myFolders = folders.filter((folder) => folder.kind === "my");
  const filtered = myFolders.filter((folder) => folder.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <DocuSignModal
      title="Move to Folder"
      onClose={onClose}
      footer={
        <>
          <form action={createFolderAction} className="mr-auto flex items-center gap-2">
            <input type="hidden" name="kind" value="my" />
            <input
              name="name"
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
              placeholder="Folder name"
              className="h-9 w-40 rounded-[2px] border border-[#c6c6c6] px-3 text-[13px]"
            />
            <button type="submit" className="h-9 rounded-[2px] border border-[#c6c6c6] bg-white px-3 text-[13px] font-semibold text-[#000]">
              New Folder
            </button>
          </form>
          <button type="button" onClick={onClose} className="h-9 px-3 text-[13px] font-semibold text-[#000]">
            Cancel
          </button>
          <form action={moveAction}>
            <input type="hidden" name="templateId" value={template.id} />
            <input type="hidden" name="folderId" value={selectedId} />
            <button
              type="submit"
              className="h-9 rounded-[2px] bg-[#4c00ff] px-4 text-[13px] font-semibold text-white"
            >
              Move
            </button>
          </form>
        </>
      }
    >
      <div className="relative">
        <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#666]" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          className="h-10 w-full rounded-[4px] border border-[#c6c6c6] pl-9 pr-3 text-[14px] outline-none focus:border-[#4c00ff]"
        />
      </div>
      <ul className="mt-4 max-h-56 overflow-y-auto rounded-[2px] border border-[#e5e5e5]">
        {[
          { id: "", name: "My Templates", kind: "my" as const, officeId: "", createdAt: "", updatedAt: "" },
          ...filtered,
        ].map((folder) => (
          <li key={folder.id || "root"}>
            <button
              type="button"
              onClick={() => setSelectedId(folder.id)}
              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-[14px] ${
                selectedId === folder.id ? "bg-[#f2f2f2]" : "hover:bg-[#fafafa]"
              }`}
            >
              <Icon name="folder" className="h-4 w-4 text-[#666]" />
              {folder.name}
            </button>
          </li>
        ))}
      </ul>
    </DocuSignModal>
  );
}

export function ShareToFoldersModal({
  template,
  folders,
  shareAction,
  onClose,
}: {
  template: TemplateRecord;
  folders: TemplateFolderRecord[];
  shareAction: ServerAction;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const shared = folders.filter((folder) => folder.kind === "shared");
  const filtered = shared.filter((folder) => folder.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <DocuSignModal
      title="Share to Folders"
      onClose={onClose}
      footer={
        <form action={shareAction}>
          <input type="hidden" name="templateId" value={template.id} />
          <input type="hidden" name="folderId" value={selectedId} />
          <button
            type="submit"
            disabled={!selectedId}
            className="h-9 rounded-[2px] bg-[#4c00ff] px-4 text-[13px] font-semibold text-white disabled:bg-[#c4b5fd]"
          >
            Share
          </button>
        </form>
      }
    >
      <div className="relative">
        <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#666]" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          className="h-10 w-full rounded-[4px] border border-[#c6c6c6] pl-9 pr-3 text-[14px] outline-none focus:border-[#4c00ff]"
        />
      </div>
      <ul className="mt-4 max-h-56 overflow-y-auto rounded-[2px] border border-[#e5e5e5]">
        {(filtered.length
          ? filtered
          : [{ id: "shared-root", name: "Shared Folders", kind: "shared" as const, officeId: "", createdAt: "", updatedAt: "" }]
        ).map((folder) => (
          <li key={folder.id}>
            <button
              type="button"
              onClick={() => setSelectedId(folder.id === "shared-root" ? "" : folder.id)}
              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-[14px] ${
                selectedId === folder.id || (!selectedId && folder.id === "shared-root") ? "bg-[#f2f2f2]" : "hover:bg-[#fafafa]"
              }`}
            >
              <Icon name="file" className="h-4 w-4 text-[#666]" />
              {folder.name}
            </button>
          </li>
        ))}
      </ul>
      {!shared.length && (
        <p className="mt-3 text-[13px] text-[#666]">No shared folders yet. Create one from Move to Folder, then mark it shared.</p>
      )}
    </DocuSignModal>
  );
}

export function CreatePowerFormModal({
  template,
  createAction,
  onClose,
}: {
  template: TemplateRecord;
  createAction: ServerAction;
  onClose: () => void;
}) {
  const ready = templateHasSigningFields(template);
  const defaultName = template.title || template.name;
  return (
    <DocuSignModal
      title="Create PowerForm"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="h-9 px-3 text-[13px] font-semibold text-[#000]">
            Cancel
          </button>
          {ready ? (
            <button
              form={`pf-${template.id}`}
              type="submit"
              className="h-9 rounded-[2px] bg-[#4c00ff] px-4 text-[13px] font-semibold text-white"
            >
              Create
            </button>
          ) : (
            <a
              href={`/powerforms/new?template=${encodeURIComponent(template.id)}`}
              className="inline-flex h-9 items-center rounded-[2px] bg-[#4c00ff] px-4 text-[13px] font-semibold text-white"
            >
              Continue — place fields
            </a>
          )}
        </>
      }
    >
      <p className="text-[14px] text-[#666]">
        PowerForm: a public link with intake fields (name, email, access code). Anyone with the link can start signing.
        Prefills from template <span className="font-semibold text-[#000]">{defaultName}</span>.
      </p>
      {!ready ? (
        <p className="mt-3 rounded-[2px] border border-[#ffe8a3] bg-[#fffbeb] px-3 py-2 text-[14px] text-[#7a5b00]">
          This template has no Signature/Initial fields yet. Continue to place them, then publish the PowerForm.
        </p>
      ) : null}
      <form id={`pf-${template.id}`} action={createAction} className="mt-4 space-y-3">
        <input type="hidden" name="templateId" value={template.id} />
        <div>
          <label className="block text-[12px] font-semibold uppercase tracking-wide text-[#666]">PowerForm name</label>
          <input
            name="name"
            defaultValue={defaultName}
            className="mt-1 h-10 w-full rounded-[2px] border border-[#c6c6c6] px-3 text-[14px]"
          />
        </div>
        <div>
          <label className="block text-[12px] font-semibold uppercase tracking-wide text-[#666]">Description</label>
          <textarea
            name="description"
            rows={2}
            defaultValue={template.description || template.message || ""}
            className="mt-1 w-full rounded-[2px] border border-[#c6c6c6] px-3 py-2 text-[14px]"
          />
        </div>
      </form>
    </DocuSignModal>
  );
}

export function CreateWebFormModal({
  template,
  createAction,
  onClose,
}: {
  template: TemplateRecord;
  createAction: ServerAction;
  onClose: () => void;
}) {
  const ready = templateHasSigningFields(template);
  const defaultName = template.title || template.name;
  const defaultInstructions =
    template.description || template.message || "Complete the fields below to begin signing.";
  return (
    <DocuSignModal
      title="Create Web Form"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="h-9 px-3 text-[13px] font-semibold text-[#000]">
            Cancel
          </button>
          {ready ? (
            <button
              form={`wf-${template.id}`}
              type="submit"
              className="h-9 rounded-[2px] bg-[#4c00ff] px-4 text-[13px] font-semibold text-white"
            >
              Create
            </button>
          ) : (
            <a
              href={`/templates/${encodeURIComponent(template.id)}/edit`}
              className="inline-flex h-9 items-center rounded-[2px] bg-[#4c00ff] px-4 text-[13px] font-semibold text-white"
            >
              Edit template — add fields
            </a>
          )}
        </>
      }
    >
      <p className="text-[14px] text-[#666]">
        Web Form: a simple online form for this template. Signers fill details, then sign. Differs from PowerForm (no
        access codes / advanced intake). Prefills from{" "}
        <span className="font-semibold text-[#000]">{defaultName}</span>.
      </p>
      {!ready ? (
        <p className="mt-3 rounded-[2px] border border-[#ffe8a3] bg-[#fffbeb] px-3 py-2 text-[14px] text-[#7a5b00]">
          Add Signature or Initial fields on the template first, then create the Web Form. You can change fields later
          anytime.
        </p>
      ) : null}
      <form id={`wf-${template.id}`} action={createAction} className="mt-4 space-y-3">
        <input type="hidden" name="templateId" value={template.id} />
        <div>
          <label className="block text-[12px] font-semibold uppercase tracking-wide text-[#666]">Web Form name</label>
          <input
            name="name"
            defaultValue={defaultName}
            className="mt-1 h-10 w-full rounded-[2px] border border-[#c6c6c6] px-3 text-[14px]"
          />
        </div>
        <div>
          <label className="block text-[12px] font-semibold uppercase tracking-wide text-[#666]">Instructions</label>
          <textarea
            name="instructions"
            rows={3}
            defaultValue={defaultInstructions}
            className="mt-1 w-full rounded-[2px] border border-[#c6c6c6] px-3 py-2 text-[14px]"
          />
        </div>
      </form>
    </DocuSignModal>
  );
}

export type CreatedFormNotice = {
  kind: "powerform" | "webform";
  form: { slug: string; name: string };
  publicUrl: string;
};
