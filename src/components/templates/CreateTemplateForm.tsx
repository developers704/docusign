"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { OfficeRecord, TemplateDocumentRecord, TemplateRecord } from "@/lib/types";
import { joinRoleNames } from "@/lib/templateFormUtils";
import { UPLOAD_ACCEPT } from "@/lib/documentImport";
import { Icon } from "@/components/Icons";
import SigningOrderDiagramModal, {
  type SigningOrderRecipient,
} from "@/components/templates/SigningOrderDiagramModal";
import TemplateRecipientCard from "@/components/templates/TemplateRecipientCard";
import TemplateDocumentCard from "@/components/templates/TemplateDocumentCard";
import DocumentPreviewModal from "@/components/templates/DocumentPreviewModal";

const MAX_TEMPLATE_DOCUMENTS = 20;
const SUBJECT_MAX = 100;
const MESSAGE_MAX = 10000;
const ENVELOPE_TYPE_MAX = 100;
const RECIPIENT_COLORS = ["#7ec8e3", "#8fd6a8", "#f0c36a", "#c4a5f5", "#f5a8c0"];

type ServerAction = (formData: FormData) => Promise<void>;

function newRecipient(index: number): SigningOrderRecipient {
  return {
    id: `r-${Date.now()}-${index}`,
    role: index === 0 ? "Signer" : index === 1 ? "Approver" : `Recipient ${index + 1}`,
    name: "",
    email: "",
    action: "needs_to_sign",
  };
}

function initialRecipients(template?: TemplateRecord): SigningOrderRecipient[] {
  if (!template?.recipientRoles?.length) return [newRecipient(0)];
  return [...template.recipientRoles]
    .sort((a, b) => a.signingOrder - b.signingOrder)
    .map((role, index) => ({
      id: role.id || `r-${index}`,
      role: role.roleName,
      name: role.defaultName || "",
      email: role.defaultEmail || "",
      action:
        role.roleType === "approver"
          ? "needs_to_approve"
          : role.roleType === "receives_copy"
            ? "receives_a_copy"
            : role.roleType === "view_only"
              ? "needs_to_view"
              : "needs_to_sign",
    }));
}

type PreviewState = { fileName: string; src: string } | null;

function SectionHeader({
  title,
  open,
  onToggle,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between py-4 text-left"
    >
      <span className="text-[16px] font-semibold text-[#000]">{title}</span>
      <Icon name="chevron" className={`h-5 w-5 text-[#666] transition ${open ? "-rotate-90" : "rotate-90"}`} />
    </button>
  );
}

export default function CreateTemplateForm({
  createAction,
  updateAction,
  template,
  allowOfficeSelection,
  offices,
  defaultOfficeId,
  folderId = "",
}: {
  createAction?: ServerAction;
  updateAction?: ServerAction;
  template?: TemplateRecord;
  allowOfficeSelection: boolean;
  offices: OfficeRecord[];
  defaultOfficeId: string;
  folderId?: string;
}) {
  const isEdit = Boolean(template);
  const submitAction = isEdit ? updateAction : createAction;
  const existingDocs = template?.documents || [];
  const router = useRouter();

  const [templateName, setTemplateName] = useState(template?.name || "");
  const [description, setDescription] = useState(template?.description || "");
  const [subject, setSubject] = useState(template?.title || template?.name || "");
  const [message, setMessage] = useState(template?.message || "");
  const [category, setCategory] = useState(template?.category || "Other");
  const [envelopeType, setEnvelopeType] = useState(template?.tags?.[0] || "");
  const [reminderFrequency, setReminderFrequency] = useState("none");
  const [recipients, setRecipients] = useState<SigningOrderRecipient[]>(() => initialRecipients(template));
  const [signingOrder, setSigningOrder] = useState(true);
  const [showOrderDiagram, setShowOrderDiagram] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [keptDocuments, setKeptDocuments] = useState<TemplateDocumentRecord[]>(existingDocs);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [openDocs, setOpenDocs] = useState(true);
  const [openRecipients, setOpenRecipients] = useState(true);
  const [openMessage, setOpenMessage] = useState(true);
  const [preview, setPreview] = useState<PreviewState>(null);
  const [pendingPreviewUrls, setPendingPreviewUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const officeId = useMemo(
    () => template?.officeId || defaultOfficeId,
    [template?.officeId, defaultOfficeId]
  );
  const [selectedOfficeId, setSelectedOfficeId] = useState(officeId);

  const totalDocs = keptDocuments.length + pendingFiles.length;
  const removedIds = useMemo(() => {
    const kept = new Set(keptDocuments.map((item) => item.id));
    return existingDocs.filter((item) => !kept.has(item.id)).map((item) => item.id);
  }, [existingDocs, keptDocuments]);

  useEffect(() => {
    setKeptDocuments(template?.documents || []);
  }, [template?.id, template?.updatedAt]);

  useEffect(() => {
    const urls = pendingFiles.map((file) => URL.createObjectURL(file));
    setPendingPreviewUrls(urls);
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [pendingFiles]);

  const headerTitle = templateName.trim() || "Untitled template";

  function openSavedPreview(doc: TemplateDocumentRecord) {
    if (!template?.id) return;
    setPreview({
      fileName: doc.originalFileName,
      src: `/api/admin/templates/${template.id}/documents/${doc.id}`,
    });
  }

  function openPendingPreview(file: File, url: string) {
    setPreview({ fileName: file.name, src: url });
  }

  function addRecipient() {
    setRecipients((current) => [...current, newRecipient(current.length)]);
  }

  function updateRecipient(id: string, patch: Partial<SigningOrderRecipient>) {
    setRecipients((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function removeRecipient(id: string) {
    setRecipients((current) => (current.length <= 1 ? current : current.filter((item) => item.id !== id)));
  }

  function moveRecipient(id: string, direction: -1 | 1) {
    setRecipients((current) => {
      const index = current.findIndex((item) => item.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const copy = [...current];
      const [item] = copy.splice(index, 1);
      copy.splice(nextIndex, 0, item);
      return copy;
    });
  }

  function addFiles(fileList: FileList | File[] | null) {
    if (!fileList) return;
    const incoming = Array.from(fileList).filter((file) => file.size > 0);
    if (!incoming.length) return;

    // Edit mode: upload immediately so preview works in this same form.
    if (template?.id) {
      void uploadFilesNow(incoming);
      return;
    }

    setPendingFiles((current) => {
      const room = Math.max(0, MAX_TEMPLATE_DOCUMENTS - keptDocuments.length - current.length);
      return [...current, ...incoming.slice(0, room)];
    });
  }

  async function uploadFilesNow(files: File[]) {
    if (!template?.id || !files.length) return;
    const room = Math.max(0, MAX_TEMPLATE_DOCUMENTS - keptDocuments.length);
    const batch = files.slice(0, room);
    if (!batch.length) {
      setError(`A template can include up to ${MAX_TEMPLATE_DOCUMENTS} documents.`);
      return;
    }

    setUploading(true);
    setError("");
    try {
      const body = new FormData();
      for (const file of batch) body.append("documentFiles", file);
      const response = await fetch(`/api/admin/templates/${template.id}/documents`, {
        method: "POST",
        body,
        credentials: "same-origin",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        documents?: TemplateDocumentRecord[];
      };
      if (!response.ok) {
        throw new Error(payload.error || `Upload failed (HTTP ${response.status}).`);
      }
      if (Array.isArray(payload.documents)) {
        setKeptDocuments(payload.documents);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function removeSavedDocument(documentId: string) {
    if (!template?.id) {
      setKeptDocuments((current) => current.filter((item) => item.id !== documentId));
      return;
    }
    setUploading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/templates/${template.id}/documents/${documentId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        documents?: TemplateDocumentRecord[];
      };
      if (!response.ok) {
        throw new Error(payload.error || `Delete failed (HTTP ${response.status}).`);
      }
      if (Array.isArray(payload.documents)) {
        setKeptDocuments(payload.documents);
      } else {
        setKeptDocuments((current) => current.filter((item) => item.id !== documentId));
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove document.");
    } finally {
      setUploading(false);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    addFiles(event.dataTransfer.files);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!submitAction) return;
    setError("");

    if (keptDocuments.length + pendingFiles.length === 0) {
      setError("Add at least one document to continue.");
      setOpenDocs(true);
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("name", templateName.trim());
    formData.set("title", subject.trim() || templateName.trim());
    formData.set("description", description.trim());
    formData.set("message", message.trim());
    formData.set("category", category.trim() || "Other");
    formData.set("tags", envelopeType.trim());
    formData.set(
      "internalNotes",
      reminderFrequency !== "none" ? `reminderFrequency=${reminderFrequency}` : ""
    );
    formData.set("content", description.trim() || templateName.trim() || "Uploaded template document.");
    formData.set("roleNames", joinRoleNames(recipients.map((item) => item.role.trim() || "Signer")));
    formData.set(
      "recipientRoleDefaults",
      JSON.stringify(
        recipients.map((item) => ({
          roleName: item.role.trim() || "Signer",
          defaultName: item.name.trim(),
          defaultEmail: item.email.trim(),
          action: item.action,
        }))
      )
    );
    formData.delete("documentFiles");
    for (const file of pendingFiles) formData.append("documentFiles", file);
  // Edit mode already uploads/deletes via API — avoid wiping those on Save.
  if (!template?.id) {
    for (const id of removedIds) formData.append("removeDocumentIds", id);
  }

    setBusy(true);
    try {
      await submitAction(formData);
      // Server action redirects to the edit page so the uploaded PDF stays visible in this form.
      router.refresh();
    } catch (err) {
      const digest =
        typeof err === "object" && err && "digest" in err ? String((err as { digest?: string }).digest || "") : "";
      if (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")) throw err;
      setError(err instanceof Error ? err.message : "Unable to save template.");
      setBusy(false);
    }
  }

  if (!submitAction) return null;

  return (
    <form onSubmit={onSubmit} className="flex min-h-[calc(100dvh-3.5rem)] flex-col bg-[#f7f7f7] text-[#000] sm:min-h-[calc(100vh-62px)]">
      {isEdit && template && <input type="hidden" name="templateId" value={template.id} />}
      <input type="hidden" name="visibility" value={template?.visibility || "office"} />
      <input type="hidden" name="officeId" value={allowOfficeSelection && !isEdit ? selectedOfficeId : officeId} />
      {!isEdit && folderId ? <input type="hidden" name="folderId" value={folderId} /> : null}

      {/* Header */}
      <div className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-[#e0e0e0] bg-white px-4 sm:px-6">
        <Link
          href="/templates"
          aria-label="Close"
          className="inline-flex h-9 w-9 items-center justify-center rounded text-[22px] leading-none text-[#666] hover:bg-[#f2f2f2]"
        >
          ×
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-[16px] font-semibold text-[#000]">{headerTitle}</h1>
        <button
          type="button"
          aria-label="Help"
          className="inline-flex h-9 w-9 items-center justify-center rounded text-[#666] hover:bg-[#f2f2f2]"
        >
          <Icon name="help" className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => setShowAdvanced((value) => !value)}
          className="inline-flex h-9 items-center rounded-[2px] border border-[#c6c6c6] bg-white px-2.5 text-[11px] font-semibold tracking-wide text-[#000] hover:bg-[#f5f5f5] sm:px-3 sm:text-[12px]"
        >
          <span className="sm:hidden">ADVANCED</span>
          <span className="hidden sm:inline">ADVANCED OPTIONS</span>
        </button>
      </div>

      <div className="mx-auto w-full max-w-[920px] flex-1 px-4 py-6 sm:px-6">
        {allowOfficeSelection && !isEdit && (
          <label className="mb-5 block rounded-[2px] border border-[#e0e0e0] bg-white px-5 py-4">
            <span className="mb-1 block text-[13px] text-[#666]">Office</span>
            <select
              value={selectedOfficeId}
              onChange={(event) => setSelectedOfficeId(event.target.value)}
              required
              className="h-10 w-full rounded-[2px] border border-[#c6c6c6] px-3 text-[14px] outline-none focus:border-[#4c00ff]"
            >
              {offices.map((office) => (
                <option key={office.id} value={office.id}>
                  {office.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Template name + description */}
        <section className="rounded-[2px] border border-[#e0e0e0] bg-white px-5 py-5">
          <label className="block">
            <span className="mb-1.5 block text-[13px] text-[#666]">Template name</span>
            <input
              value={templateName}
              onChange={(event) => {
                setTemplateName(event.target.value);
                if (!subject || subject === template?.title || subject === template?.name) {
                  setSubject(event.target.value);
                }
              }}
              required
              maxLength={120}
              className="h-11 w-full rounded-[2px] border border-[#c6c6c6] px-3 text-[14px] outline-none focus:border-[#4c00ff]"
            />
          </label>
          <label className="mt-4 block">
            <span className="mb-1.5 block text-[13px] text-[#666]">Template description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              placeholder="Description (optional)"
              className="w-full rounded-[2px] border border-[#c6c6c6] px-3 py-2 text-[14px] outline-none focus:border-[#4c00ff]"
            />
          </label>
        </section>

        {/* Add documents */}
        <section className="mt-3 rounded-[2px] border border-[#e0e0e0] bg-white px-5">
          <SectionHeader title="Add documents" open={openDocs} onToggle={() => setOpenDocs((v) => !v)} />
          {openDocs && (
            <div className="border-t border-[#ececec] pb-5 pt-4">
              <div className="flex flex-wrap gap-3">
                {keptDocuments.map((doc) => (
                  <TemplateDocumentCard
                    key={doc.id}
                    fileName={doc.originalFileName}
                    pageCount={doc.pageCount}
                    previewSrc={
                      template?.id ? `/api/admin/templates/${template.id}/documents/${doc.id}` : null
                    }
                    onPreview={() => openSavedPreview(doc)}
                    onRemove={() => void removeSavedDocument(doc.id)}
                  />
                ))}

                {pendingFiles.map((file, index) => {
                  const url = pendingPreviewUrls[index];
                  const isPdf =
                    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
                  return (
                    <TemplateDocumentCard
                      key={`${file.name}-${file.size}-${index}`}
                      fileName={file.name}
                      pageCount={null}
                      previewSrc={isPdf ? url : null}
                      onPreview={() => {
                        if (isPdf && url) openPendingPreview(file, url);
                      }}
                      onRemove={() => setPendingFiles((current) => current.filter((_, i) => i !== index))}
                    />
                  );
                })}

                {totalDocs < MAX_TEMPLATE_DOCUMENTS && (
                  <div
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={onDrop}
                    className={`flex h-[172px] w-[168px] flex-col items-center justify-center rounded-[2px] border border-dashed px-3 text-center ${
                      dragOver ? "border-[#4c00ff] bg-[#f0ebff]" : "border-[#c6c6c6] bg-[#fafafa]"
                    } ${uploading || busy ? "pointer-events-none opacity-60" : ""}`}
                  >
                    <Icon name="upload" className="h-7 w-7 text-[#666]" />
                    <p className="mt-2 text-[12px] leading-snug text-[#666]">
                      {uploading ? "Uploading…" : "Drop your files here or"}
                    </p>
                    <button
                      type="button"
                      disabled={uploading || busy}
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-2 inline-flex h-8 items-center gap-1 rounded-[2px] bg-[#4c00ff] px-3 text-[12px] font-semibold text-white hover:bg-[#3d00cf] disabled:opacity-60"
                    >
                      Upload
                      <Icon name="chevron" className="h-3.5 w-3.5 rotate-90 opacity-90" />
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={UPLOAD_ACCEPT}
                      multiple
                      className="hidden"
                      onChange={(event) => {
                        addFiles(event.target.files);
                        event.target.value = "";
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Add recipients */}
        <section className="mt-3 rounded border border-[#e0e0e0] bg-white px-5">
          <SectionHeader title="Add recipients" open={openRecipients} onToggle={() => setOpenRecipients((v) => !v)} />
          {openRecipients && (
            <div className="border-t border-[#ececec] pb-5 pt-4">
              <div className="mb-4 flex flex-wrap items-center gap-4">
                <label className="inline-flex items-center gap-2 text-[15px] text-[#000]">
                  <input
                    type="checkbox"
                    checked={signingOrder}
                    onChange={(event) => setSigningOrder(event.target.checked)}
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
              </div>
              <p className="mb-4 text-[13px] text-[#666]">
                Name and email saved here become defaults when you use this template for an agreement — you can still edit them there.
              </p>
              <div className="space-y-4">
                {recipients.map((recipient, index) => (
                  <TemplateRecipientCard
                    key={recipient.id}
                    recipient={recipient}
                    index={index}
                    color={RECIPIENT_COLORS[index % RECIPIENT_COLORS.length]}
                    signingOrder={signingOrder}
                    canRemove={recipients.length > 1}
                    onChange={(patch) => updateRecipient(recipient.id, patch)}
                    onRemove={() => removeRecipient(recipient.id)}
                    onMove={(direction) => moveRecipient(recipient.id, direction)}
                  />
                ))}
              </div>

              <div className="mt-4 inline-flex overflow-hidden rounded border border-[#c6c6c6] bg-[#f2f2f2]">
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
            </div>
          )}
        </section>

        {/* Add message */}
        <section className="mt-3 rounded-[2px] border border-[#e0e0e0] bg-white px-5">
          <SectionHeader title="Add message" open={openMessage} onToggle={() => setOpenMessage((v) => !v)} />
          {openMessage && (
            <div className="border-t border-[#ececec] pb-5 pt-4">
              <label className="block">
                <span className="mb-1.5 block text-[13px] text-[#666]">Subject</span>
                <input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value.slice(0, SUBJECT_MAX))}
                  maxLength={SUBJECT_MAX}
                  className="h-11 w-full rounded-[2px] border border-[#c6c6c6] px-3 text-[14px] outline-none focus:border-[#4c00ff]"
                />
                <p className="mt-1 text-right text-[11px] text-[#666]">
                  {subject.length}/{SUBJECT_MAX}
                </p>
              </label>
              <label className="mt-2 block">
                <span className="mb-1.5 block text-[13px] text-[#666]">Message</span>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value.slice(0, MESSAGE_MAX))}
                  rows={5}
                  maxLength={MESSAGE_MAX}
                  className="w-full rounded-[2px] border border-[#c6c6c6] px-3 py-2 text-[14px] outline-none focus:border-[#4c00ff]"
                />
                <p className="mt-1 text-right text-[11px] text-[#666]">
                  {message.length}/{MESSAGE_MAX}
                </p>
              </label>
            </div>
          )}
        </section>

        {/* Category / Envelope types / Reminders */}
        <section className="mt-3 space-y-4 rounded-[2px] border border-[#e0e0e0] bg-white px-5 py-5">
          <label className="block max-w-md">
            <span className="mb-1.5 inline-flex items-center gap-1 text-[13px] text-[#666]">
              Category <span className="text-[#b00020]">*</span>
              <Icon name="help" className="h-3.5 w-3.5 text-[#999]" />
            </span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              required
              className="h-11 w-full rounded-[2px] border border-[#c6c6c6] bg-white px-3 text-[14px] outline-none focus:border-[#4c00ff]"
            >
              <option>Other</option>
              <option>HR</option>
              <option>Sales</option>
              <option>Legal</option>
              <option>Finance</option>
              <option>Operations</option>
            </select>
          </label>

          <label className="block max-w-md">
            <span className="mb-1.5 block text-[13px] text-[#666]">
              Envelope Types <span className="text-[#b00020]">*</span>
            </span>
            <p className="mb-1.5 text-[11px] text-[#888]">Do not enter personal data or other PII</p>
            <input
              value={envelopeType}
              onChange={(event) => setEnvelopeType(event.target.value.slice(0, ENVELOPE_TYPE_MAX))}
              required
              maxLength={ENVELOPE_TYPE_MAX}
              className="h-11 w-full rounded-[2px] border border-[#c6c6c6] px-3 text-[14px] outline-none focus:border-[#4c00ff]"
            />
            <p className="mt-1 text-right text-[11px] text-[#666]">
              {envelopeType.length}/{ENVELOPE_TYPE_MAX}
            </p>
          </label>

          <label className="block max-w-md">
            <span className="mb-1.5 inline-flex items-center gap-1 text-[13px] text-[#666]">
              Frequency of reminders
              <Icon name="help" className="h-3.5 w-3.5 text-[#999]" />
            </span>
            <select
              value={reminderFrequency}
              onChange={(event) => setReminderFrequency(event.target.value)}
              className="h-11 w-full rounded-[2px] border border-[#c6c6c6] bg-[#f5f5f5] px-3 text-[14px] text-[#666] outline-none"
            >
              <option value="none">Select frequency</option>
              <option value="every_day">Every day</option>
              <option value="every_2_days">Every 2 days</option>
              <option value="every_3_days">Every 3 days</option>
              <option value="every_week">Every week</option>
            </select>
          </label>

          {showAdvanced && (
            <div className="border-t border-[#ececec] pt-4">
              <p className="text-[13px] font-semibold text-[#000]">Advanced options</p>
              <p className="mt-1 text-[12px] text-[#666]">
                Visibility stays office-scoped for this portal. Additional routing options can be configured when sending.
              </p>
            </div>
          )}
        </section>

        {error && <p className="mt-4 rounded-[2px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>}
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 z-20 flex flex-col-reverse gap-2 border-t border-[#e0e0e0] bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-6 sm:pb-3">
        <button
          type="submit"
          disabled={busy}
          className="h-11 w-full rounded-[2px] border border-[#c6c6c6] bg-white px-4 text-[14px] font-semibold text-[#000] hover:bg-[#f5f5f5] disabled:opacity-60 sm:h-10 sm:w-auto sm:text-[13px]"
        >
          Save and Close
        </button>
        <button
          type="submit"
          disabled={busy}
          className="h-11 w-full rounded-[2px] bg-[#4c00ff] px-5 text-[14px] font-semibold text-white hover:bg-[#3d00cf] disabled:opacity-60 sm:h-10 sm:w-auto sm:text-[13px]"
        >
          {busy ? "Saving…" : "Next"}
        </button>
      </div>

      {showOrderDiagram && (
        <SigningOrderDiagramModal
          recipients={recipients}
          senderLabel="Me"
          onClose={() => setShowOrderDiagram(false)}
        />
      )}

      {preview && (
        <DocumentPreviewModal
          fileName={preview.fileName}
          src={preview.src}
          onClose={() => setPreview(null)}
        />
      )}
    </form>
  );
}
