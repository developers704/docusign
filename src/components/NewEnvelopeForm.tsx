"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { OfficeRecord, TemplateRecord, EnvelopeRecord } from "@/lib/types";
import RecipientList from "@/components/envelope/RecipientList";
import { Icon } from "@/components/Icons";
import { UPLOAD_ACCEPT, UPLOAD_HELP_TEXT } from "@/lib/documentImport";
import { REMINDER_FREQUENCY_OPTIONS } from "@/lib/categoryConstants";
import ScheduleDateTimeFields, { useDetectedTimeZone } from "@/components/ScheduleDateTimeFields";
import { toDateTimeLocalValue, wallTimeInZoneToUtcIso } from "@/lib/timezone";
import {
  autoAssignSingleTemplateRoles,
  createRecipient,
  envelopeRecipientsToForm,
  inferWorkflowType,
  normalizeRecipientsForSubmit,
  parseRecipientCsv,
  sendModeUsesSigningOrder,
  validateRecipientForm,
  type AgreementSendMode,
  type RecipientFormInput,
} from "@/lib/recipientFormUtils";

type Section = "documents" | "recipients" | "message";

export default function NewEnvelopeForm({
  templates,
  offices,
  defaultOfficeId,
  allowOfficeSelection,
  initialTemplate,
  initialCategories = [],
  bulkMode = false,
  editEnvelope,
}: {
  templates: TemplateRecord[];
  offices: OfficeRecord[];
  defaultOfficeId: string;
  allowOfficeSelection: boolean;
  initialTemplate?: TemplateRecord;
  initialCategories?: string[];
  /** Bulk send: one independent agreement per recipient (same document). */
  bulkMode?: boolean;
  /** Edit an existing draft (back from prepare). */
  editEnvelope?: EnvelopeRecord;
}) {
  const router = useRouter();
  const editMode = Boolean(editEnvelope);
  const fileRef = useRef<HTMLInputElement>(null);
  const [openSection, setOpenSection] = useState<Section>(
    editMode ? "recipients" : bulkMode ? "recipients" : "documents"
  );
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
  const [recipients, setRecipients] = useState<RecipientFormInput[]>(() => {
    if (editEnvelope) return envelopeRecipientsToForm(editEnvelope.recipients);
    if (bulkMode) {
      return [createRecipient(0), createRecipient(1)];
    }
    if (initialTemplate?.recipientRoles?.length) {
      return [...initialTemplate.recipientRoles]
        .sort((a, b) => a.signingOrder - b.signingOrder)
        .map((role, index) => ({
          ...createRecipient(index),
          name: role.defaultName || "",
          email: role.defaultEmail || "",
          templateRoleId: role.id,
          role: role.roleName || "Signer",
          recipientType:
            role.roleType === "receives_copy"
              ? "receives_copy"
              : role.roleType === "view_only"
                ? "view_only"
                : role.roleType === "approver"
                  ? "approver"
                  : "signer",
          signingStep: role.signingStep || index + 1,
        }));
    }
    return [createRecipient(0)];
  });
  const [sendMode, setSendMode] = useState<AgreementSendMode>(() => {
    if (editEnvelope?.workflowType === "parallel") return "group";
    if (editEnvelope?.workflowType === "sequential" || editEnvelope?.workflowType === "grouped") {
      return "sequential";
    }
    return bulkMode ? "group" : "sequential";
  });
  const signingOrderEnabled = bulkMode ? false : sendModeUsesSigningOrder(sendMode);
  /** Bulk: how to add recipients — manual cards vs CSV file / paste */
  const [bulkAddMethod, setBulkAddMethod] = useState<"manual" | "csv">("manual");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [officeId, setOfficeId] = useState(editEnvelope?.officeId || defaultOfficeId);
  const [documentMode, setDocumentMode] = useState<"write" | "upload" | "template">(() =>
    initialTemplate?.documents?.some((doc) => doc.filePath) ? "template" : "upload"
  );
  const [documentText, setDocumentText] = useState(initialTemplate?.content || "");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [title, setTitle] = useState(editEnvelope?.title || initialTemplate?.title || "");
  const [envelopeMessage, setEnvelopeMessage] = useState(editEnvelope?.message || initialTemplate?.message || "");
  const [emailSubject, setEmailSubject] = useState(
    editEnvelope
      ? `Complete with Valliani: ${editEnvelope.title}`
      : initialTemplate
        ? `Complete with Valliani: ${initialTemplate.title}`
        : "Complete with Valliani Contracts"
  );
  const [templateId, setTemplateId] = useState(editEnvelope?.templateId || initialTemplate?.id || "");
  const [categories, setCategories] = useState<string[]>(initialCategories);
  const [category, setCategory] = useState(editEnvelope?.category || "");
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [reminderFrequency, setReminderFrequency] = useState(editEnvelope?.reminderFrequency || "every_day");
  const [deliveryMode, setDeliveryMode] = useState<"later" | "schedule">("later");
  const [timeZone, setTimeZone] = useDetectedTimeZone();
  const [scheduleAt, setScheduleAt] = useState("");
  const [scheduleSeeded, setScheduleSeeded] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("esign_notice");
    if (!stored) return;
    sessionStorage.removeItem("esign_notice");
    setNotice(stored);
  }, []);

  useEffect(() => {
    if (scheduleSeeded || !timeZone) return;
    setScheduleAt(toDateTimeLocalValue(new Date(Date.now() + 60 * 60 * 1000), timeZone));
    setScheduleSeeded(true);
  }, [scheduleSeeded, timeZone]);

  const visibleTemplates = useMemo(
    () => templates.filter((template) => template.officeId === officeId || template.visibility === "global"),
    [templates, officeId]
  );
  const selectedTemplate = useMemo(
    () => visibleTemplates.find((template) => template.id === templateId),
    [visibleTemplates, templateId]
  );
  const templateRoles = selectedTemplate?.recipientRoles || [];
  const showTemplateRoles = Boolean(selectedTemplate && templateRoles.length > 0);
  const templateDocuments = selectedTemplate?.documents || [];
  const hasTemplateDocuments = templateDocuments.some((doc) => Boolean(doc.filePath));

  useEffect(() => {
    if (!uploadMenuOpen) return;
    function onDocClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target?.closest?.("[data-upload-menu]")) setUploadMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [uploadMenuOpen]);

  useEffect(() => {
    if (initialCategories.length) return;
    void fetch("/api/categories")
      .then((res) => res.json())
      .then((data: { items?: string[] }) => {
        if (Array.isArray(data.items)) setCategories(data.items);
      })
      .catch(() => undefined);
  }, [initialCategories.length]);

  function applyTemplate(id: string) {
    setTemplateId(id);
    const template = visibleTemplates.find((item) => item.id === id) || templates.find((item) => item.id === id);
    if (!template) {
      setDocumentMode("upload");
      return;
    }
    setTitle(template.title);
    setEnvelopeMessage(template.message);
    setEmailSubject(`Complete with Valliani: ${template.title}`);
    setDocumentText(template.content || "");
    setUploadedFile(null);
    setDocumentMode(template.documents?.some((doc) => doc.filePath) ? "template" : "write");
    setCategory(template.category || "");
    if (!bulkMode) {
      const roles = [...(template.recipientRoles || [])].sort((a, b) => a.signingOrder - b.signingOrder);
      if (roles.length) {
        setRecipients(
          roles.map((role, index) => ({
            ...createRecipient(index),
            name: role.defaultName || "",
            email: role.defaultEmail || "",
            templateRoleId: role.id,
            role: role.roleName || "Signer",
            recipientType:
              role.roleType === "receives_copy"
                ? "receives_copy"
                : role.roleType === "view_only"
                  ? "view_only"
                  : role.roleType === "approver"
                    ? "approver"
                    : "signer",
            signingStep: role.signingStep || index + 1,
          }))
        );
      } else {
        setRecipients((current) => autoAssignSingleTemplateRoles(template.recipientRoles || [], current));
      }
    }
    setOpenSection("recipients");
  }

  function validateDocumentStep() {
    if (!officeId) return "Select an office workspace.";
    if (!title.trim()) return "Enter a document title.";
    if (documentMode === "template") {
      if (!templateId || !hasTemplateDocuments) return "Selected template has no uploaded documents.";
      return null;
    }
    if (documentMode === "write" && documentText.trim().length < 20) {
      return "Write at least 20 characters of contract content.";
    }
    if (documentMode === "upload" && !uploadedFile) {
      return "Upload a document or choose Write / Use a template.";
    }
    return null;
  }

  async function saveNewCategory() {
    const name = newCategory.trim();
    if (!name) return;
    const response = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const result = (await response.json()) as { items?: string[]; error?: string };
    if (!response.ok) {
      setMessage(result.error || "Could not add category.");
      return;
    }
    setCategories(result.items || []);
    setCategory(name);
    setNewCategory("");
    setAddingCategory(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editMode) {
      const documentError = validateDocumentStep();
      if (documentError) {
        setMessage(documentError);
        setOpenSection("documents");
        return;
      }
    }

    // If paste box still has text (user didn't click "Add"), import it automatically.
    let workingRecipients = recipients;
    const pasteEl =
      typeof document !== "undefined"
        ? (document.getElementById("recipient-csv-paste") as HTMLTextAreaElement | null)
        : null;
    const pasteText = pasteEl?.value?.trim() || "";
    const hasNamedRecipients = workingRecipients.some((r) => r.name.trim() && r.email.trim());
    if (pasteText && (!hasNamedRecipients || bulkAddMethod === "csv" || bulkMode)) {
      const parsed = parseRecipientCsv(pasteText, bulkMode || sendMode === "group" ? "group" : "sequential");
      if (parsed.errors.length) {
        setMessage(parsed.errors[0]);
        setOpenSection("recipients");
        setBulkAddMethod("csv");
        return;
      }
      if (parsed.recipients.length) {
        workingRecipients = parsed.recipients;
        setRecipients(workingRecipients);
      }
    }

    const validationErrors = validateRecipientForm({
      recipients: workingRecipients,
      signingOrderEnabled,
      templateRoles: bulkMode ? [] : templateRoles,
    });
    if (validationErrors.length) {
      setMessage(
        pasteText && !hasNamedRecipients
          ? validationErrors[0]
          : bulkAddMethod === "csv" && !hasNamedRecipients
            ? "Paste name,email lines, then click Add recipients from paste (or Next)."
            : validationErrors[0]
      );
      setOpenSection("recipients");
      return;
    }

    const preparedRecipients = normalizeRecipientsForSubmit(signingOrderEnabled, workingRecipients);
    if (bulkMode && preparedRecipients.length < 2) {
      setMessage("Bulk send needs at least two recipients — each gets their own contract.");
      setOpenSection("recipients");
      return;
    }
    const workflowType = bulkMode ? "parallel" : inferWorkflowType(signingOrderEnabled, preparedRecipients);

    if (editMode && editEnvelope) {
      setLoading(true);
      setMessage("Saving recipients...");
      try {
        const response = await fetch(`/api/admin/envelopes/${editEnvelope.id}/draft`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            message: envelopeMessage.trim() || emailSubject.trim(),
            category,
            reminderFrequency,
            workflowType,
            recipients: preparedRecipients.map((recipient) => ({
              id: recipient.id,
              name: recipient.name,
              email: recipient.email,
              phone: recipient.phone,
              signingStep: recipient.signingStep,
              required: recipient.required,
              templateRoleId: recipient.templateRoleId,
              action: recipient.action,
              recipientType: recipient.recipientType,
              role: recipient.role,
            })),
          }),
        });
        const result = (await response.json()) as { error?: string; envelopeId?: string };
        if (!response.ok || !result.envelopeId) {
          setMessage(result.error || "Could not save recipients.");
          return;
        }
        router.push(`/prepare/${result.envelopeId}`);
        router.refresh();
      } catch {
        setMessage("Connection error. Please try again.");
      } finally {
        setLoading(false);
      }
      return;
    }

    const formData = new FormData();
    formData.set("officeId", officeId);
    formData.set("title", title.trim());
    formData.set("message", envelopeMessage.trim() || emailSubject.trim());
    formData.set("category", category);
    formData.set("reminderFrequency", reminderFrequency);
    formData.set("workflowType", workflowType);
    formData.set("recipients", JSON.stringify(preparedRecipients));
    formData.set("documentMode", documentMode);
    formData.set("documentText", documentText);
    if (bulkMode) formData.set("bulkSend", "1");
    if (templateId) formData.set("templateId", templateId);
    if (documentMode === "upload" && uploadedFile) {
      formData.set("pdfFile", uploadedFile);
    }

    setLoading(true);
    setMessage(bulkMode ? "Creating contracts for each recipient..." : "Creating contract...");

    try {
      const response = await fetch("/api/documents", { method: "POST", body: formData });
      const result = (await response.json()) as {
        error?: string;
        envelopeId?: string;
        emailWarning?: string;
        bulk?: boolean;
        bulkCount?: number;
      };
      if (!response.ok || !result.envelopeId) {
        setMessage(result.error || "The contract could not be created.");
        return;
      }
      if (result.emailWarning) sessionStorage.setItem("esign_notice", result.emailWarning);
      if (result.bulk && result.bulkCount) {
        sessionStorage.setItem(
          "esign_notice",
          `Created ${result.bulkCount} separate contracts (one per recipient). Place signature fields once — they apply to all drafts in this bulk send. Then send each from Contracts.`
        );
      }
      if (deliveryMode === "schedule" && scheduleAt && timeZone) {
        const iso = wallTimeInZoneToUtcIso(scheduleAt, timeZone);
        if (iso && new Date(iso).getTime() > Date.now() + 30_000) {
          sessionStorage.setItem(
            `esign_schedule_${result.envelopeId}`,
            JSON.stringify({ scheduledSendAt: iso, scheduledTimezone: timeZone })
          );
        }
      }
      router.push(`/prepare/${result.envelopeId}`);
      router.refresh();
    } catch {
      setMessage("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function SectionHeader({
    id,
    title: sectionTitle,
  }: {
    id: Section;
    title: string;
  }) {
    const open = openSection === id;
    return (
      <button
        type="button"
        onClick={() => setOpenSection(id)}
        className="flex w-full items-center justify-between border-b border-[#e8e8e8] px-1 py-4 text-left"
      >
        <span className="text-[18px] font-semibold text-[#212121]">{sectionTitle}</span>
        <Icon name="chevron" className={`h-4 w-4 text-[#666] transition ${open ? "-rotate-90" : "rotate-90"}`} />
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-1">
      {allowOfficeSelection && (
        <div className="mb-4 rounded-lg border border-[#e8e8e8] bg-[#fafafa] p-4">
          <label htmlFor="officeId" className="mb-2 block text-sm font-semibold text-[#212121]">
            Office workspace
          </label>
          <select
            id="officeId"
            value={officeId}
            onChange={(event) => {
              setOfficeId(event.target.value);
              setTemplateId("");
            }}
            required
            className="h-10 w-full rounded border border-[#c6c6c6] bg-white px-3 text-sm"
          >
            <option value="">Select an office</option>
            {offices
              .filter((office) => office.isActive)
              .map((office) => (
                <option key={office.id} value={office.id}>
                  {office.name}
                </option>
              ))}
          </select>
        </div>
      )}
      {!allowOfficeSelection && <input type="hidden" name="officeId" value={officeId} />}

      {/* Add documents */}
      {!editMode && (
      <section>
        <SectionHeader id="documents" title="Add documents" />
        {openSection === "documents" && (
          <div className="space-y-4 py-4">
            <div>
              <label htmlFor="title" className="mb-1 block text-[13px] text-[#666]">
                Document title <span className="text-red-600">*</span>
              </label>
              <input
                id="title"
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  if (!emailSubject || emailSubject.startsWith("Complete with")) {
                    setEmailSubject(`Complete with Valliani: ${event.target.value || "Contract"}`);
                  }
                }}
                required
                placeholder="Employee Workplace Policies Acknowledgment Contract"
                className="h-11 w-full rounded-[2px] border border-[#c6c6c6] px-3 text-[15px] outline-none focus:border-[#4c00ff]"
              />
            </div>

            <div className="relative flex min-h-[140px] flex-col items-center justify-center rounded-[2px] border border-[#d8d8d8] bg-[#f7f7f7] px-6 py-8 text-center">
              <Icon name="upload" className="h-7 w-7 text-[#4c00ff]" />
              <div className="mt-3 text-[14px] text-[#333]">
                Drop your files here or{" "}
                <span className="relative inline-block align-middle" data-upload-menu>
                  <button
                    type="button"
                    onClick={() => setUploadMenuOpen((value) => !value)}
                    className="inline-flex items-center gap-1 rounded-[2px] bg-[#4c00ff] px-3 py-1.5 text-[13px] font-semibold text-white"
                  >
                    Upload
                    <Icon name="chevron" className="h-3 w-3 rotate-90" />
                  </button>
                  {uploadMenuOpen && (
                    <div className="absolute left-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-[2px] border border-[#d8d8d8] bg-white text-left shadow-lg">
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-[13px] hover:bg-[#f2f2f2]"
                        onClick={() => {
                          setDocumentMode("upload");
                          setUploadMenuOpen(false);
                          fileRef.current?.click();
                        }}
                      >
                        <Icon name="file" className="h-4 w-4 text-[#4c00ff]" /> Browse
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-[13px] hover:bg-[#f2f2f2]"
                        onClick={() => {
                          setDocumentMode("template");
                          setUploadMenuOpen(false);
                        }}
                      >
                        <Icon name="template" className="h-4 w-4 text-[#4c00ff]" /> Use a template
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 border-t border-[#eee] px-3 py-2.5 text-[13px] hover:bg-[#f2f2f2]"
                        onClick={() => {
                          setDocumentMode("write");
                          setUploadMenuOpen(false);
                        }}
                      >
                        <Icon name="agreement" className="h-4 w-4 text-[#4c00ff]" /> Write text
                      </button>
                    </div>
                  )}
                </span>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept={UPLOAD_ACCEPT}
                className="hidden"
                onChange={(event) => {
                  setUploadedFile(event.target.files?.[0] || null);
                  setDocumentMode("upload");
                }}
              />
              {uploadedFile && (
                <p className="mt-3 text-[12px] font-semibold text-emerald-700">
                  Selected: {uploadedFile.name}
                </p>
              )}
              <p className="mt-2 text-[11px] text-[#888]">{UPLOAD_HELP_TEXT}</p>
            </div>

            {documentMode === "template" && (
              <div className="space-y-2">
                <label className="block text-[13px] text-[#666]">Template</label>
                <select
                  value={templateId}
                  onChange={(event) => applyTemplate(event.target.value)}
                  className="h-10 w-full rounded-[2px] border border-[#c6c6c6] px-3 text-sm"
                >
                  <option value="">Select a template</option>
                  {visibleTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
                {hasTemplateDocuments && (
                  <ul className="space-y-1 text-[12px] text-[#555]">
                    {templateDocuments.map((doc) => (
                      <li key={doc.id} className="rounded border border-[#eee] bg-white px-3 py-2">
                        {doc.originalFileName} · {doc.pageCount || 1} pages
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {documentMode === "write" && (
              <textarea
                value={documentText}
                onChange={(event) => setDocumentText(event.target.value)}
                rows={10}
                placeholder="Write your contract content here..."
                className="w-full rounded-[2px] border border-[#c6c6c6] px-3 py-3 text-sm leading-6"
              />
            )}

          </div>
        )}
      </section>
      )}

      {editMode && editEnvelope && (
        <div className="rounded border border-[#e8e8e8] bg-[#fafafa] px-4 py-3 text-sm text-[#555]">
          <p className="font-semibold text-[#212121]">{editEnvelope.title}</p>
          <p className="mt-1 text-[12px]">{editEnvelope.originalFileName}</p>
        </div>
      )}

      {/* Add recipients */}
      <section>
        <SectionHeader id="recipients" title="Add recipients" />
        {openSection === "recipients" && (
          <div className="space-y-4 py-4">
            {bulkMode && (
              <>
                <div className="rounded border border-[#d9ccff] bg-[#faf8ff] px-4 py-3 text-[13px] text-[#333]">
                  Each recipient gets <strong>their own contract</strong> with the same document. Contracts list will
                  show them separately (e.g. &ldquo;{title || "Policy"} — Name&rdquo;), each with its own certificate after
                  signing.
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setBulkAddMethod("manual")}
                    className={`rounded border p-4 text-left ${
                      bulkAddMethod === "manual"
                        ? "border-2 border-[#4c00ff] bg-[#faf8ff]"
                        : "border border-[#d8d8d8] bg-white"
                    }`}
                  >
                    <p className="font-semibold text-[#212121]">Enter manually</p>
                    <p className="mt-1 text-[13px] text-[#666]">Best for shorter lists. Type each name and email.</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBulkAddMethod("csv");
                      setOpenSection("recipients");
                    }}
                    className={`rounded border p-4 text-left ${
                      bulkAddMethod === "csv"
                        ? "border-2 border-[#4c00ff] bg-[#faf8ff]"
                        : "border border-[#d8d8d8] bg-white"
                    }`}
                  >
                    <p className="font-semibold text-[#212121]">CSV upload or paste</p>
                    <p className="mt-1 text-[13px] text-[#666]">
                      Same format for both: <code className="rounded bg-white px-1">name,email</code>
                    </p>
                  </button>
                </div>
              </>
            )}
            <RecipientList
              recipients={recipients}
              sendMode={sendMode}
              bulkMode={bulkMode}
              forceCsvOpen={bulkMode && bulkAddMethod === "csv"}
              hideManualCards={bulkMode && bulkAddMethod === "csv"}
              templateRoles={templateRoles}
              showTemplateRoles={showTemplateRoles}
              onRecipientsChange={setRecipients}
              onSendModeChange={setSendMode}
            />
          </div>
        )}
      </section>

      {/* Add message */}
      <section>
        <SectionHeader id="message" title="Add message" />
        {openSection === "message" && (
          <div className="space-y-4 py-4">
            <div>
              <label className="mb-1 block text-[13px] text-[#666]">Email subject</label>
              <input
                value={emailSubject}
                onChange={(event) => setEmailSubject(event.target.value)}
                className="h-11 w-full rounded-[2px] border border-[#c6c6c6] px-3 text-[15px]"
              />
            </div>
            <div>
              <label className="mb-1 block text-[13px] text-[#666]">Email message</label>
              <textarea
                value={envelopeMessage}
                onChange={(event) => setEnvelopeMessage(event.target.value)}
                rows={4}
                placeholder="Please review and sign this contract."
                className="w-full rounded-[2px] border border-[#c6c6c6] px-3 py-3 text-sm"
              />
            </div>
          </div>
        )}
      </section>

      {/* Category + reminders */}
      <div className="grid gap-4 border-t border-[#e8e8e8] pt-5 sm:grid-cols-2">
        <div>
          <label className="mb-1 flex items-center gap-1 text-[13px] font-semibold text-[#212121]">
            Category <Icon name="help" className="h-3.5 w-3.5 text-[#888]" />
          </label>
          <select
            value={addingCategory ? "__add_category__" : category}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "__add_category__") {
                setAddingCategory(true);
                return;
              }
              setAddingCategory(false);
              setCategory(value);
            }}
            className="h-10 w-full rounded-[2px] border border-[#c6c6c6] bg-white px-3 text-sm"
          >
            <option value="">-- Select --</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
            <option value="__add_category__">+ Add category…</option>
          </select>
          {addingCategory && (
            <div className="mt-2 flex gap-2">
              <input
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
                placeholder="New category name"
                className="h-9 flex-1 rounded-[2px] border border-[#c6c6c6] px-3 text-sm"
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void saveNewCategory();
                  }
                  if (event.key === "Escape") {
                    setAddingCategory(false);
                    setNewCategory("");
                  }
                }}
              />
              <button
                type="button"
                onClick={() => void saveNewCategory()}
                className="rounded-[2px] bg-[#4c00ff] px-3 text-[12px] font-semibold text-white"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddingCategory(false);
                  setNewCategory("");
                }}
                className="rounded-[2px] border border-[#c6c6c6] px-3 text-[12px] font-semibold text-[#666]"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
        <div>
          <label className="mb-1 flex items-center gap-1 text-[13px] font-semibold text-[#212121]">
            Frequency of reminders <Icon name="help" className="h-3.5 w-3.5 text-[#888]" />
          </label>
          <select
            value={reminderFrequency}
            onChange={(event) => setReminderFrequency(event.target.value)}
            className="h-10 w-full rounded-[2px] border border-[#c6c6c6] bg-white px-3 text-sm"
          >
            {REMINDER_FREQUENCY_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-3 border-t border-[#e8e8e8] pt-5">
        <p className="text-[13px] font-semibold text-[#212121]">Send timing (after you place fields)</p>
        <p className="text-[12px] text-[#666]">
          Choose Schedule now to lock a date & time — after Prepare, one click schedules the signing emails.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label
            className={`flex cursor-pointer items-start gap-2 rounded-[2px] border px-3 py-3 ${
              deliveryMode === "later" ? "border-[#21004c] ring-1 ring-[#21004c]" : "border-[#c6c6c6]"
            }`}
          >
            <input
              type="radio"
              name="delivery-mode"
              checked={deliveryMode === "later"}
              onChange={() => setDeliveryMode("later")}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-semibold">Decide on Prepare</span>
              <span className="block text-xs text-[#666]">Send now or schedule after placing fields</span>
            </span>
          </label>
          <label
            className={`flex cursor-pointer items-start gap-2 rounded-[2px] border px-3 py-3 ${
              deliveryMode === "schedule" ? "border-[#4c00ff] ring-1 ring-[#4c00ff]" : "border-[#c6c6c6]"
            }`}
          >
            <input
              type="radio"
              name="delivery-mode"
              checked={deliveryMode === "schedule"}
              onChange={() => setDeliveryMode("schedule")}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-semibold">Schedule</span>
              <span className="block text-xs text-[#666]">Pick date & time — emails auto-send then</span>
            </span>
          </label>
        </div>
        {deliveryMode === "schedule" ? (
          <ScheduleDateTimeFields
            value={scheduleAt}
            onChange={setScheduleAt}
            timeZone={timeZone}
            onTimeZoneChange={(next) => {
              if (scheduleAt) {
                const previousIso = wallTimeInZoneToUtcIso(scheduleAt, timeZone);
                if (previousIso) setScheduleAt(toDateTimeLocalValue(previousIso, next));
              }
              setTimeZone(next);
            }}
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e8e8e8] pt-5">
        {editMode && editEnvelope ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => router.push("/agreements?view=draft")}
            className="rounded-[2px] border border-[#c6c6c6] px-5 py-2.5 text-[14px] font-semibold text-[#333]"
          >
            Back
          </button>
        ) : bulkMode ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              if (typeof window !== "undefined" && window.history.length > 1) router.back();
              else router.push("/");
            }}
            className="rounded-[2px] border border-[#c6c6c6] px-5 py-2.5 text-[14px] font-semibold text-[#333]"
          >
            Back
          </button>
        ) : (
          <span />
        )}
        <button
          disabled={loading || !officeId}
          type="submit"
          className="rounded-[2px] bg-[#4c00ff] px-6 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
        >
          {loading ? (editMode ? "Saving..." : "Creating...") : "Next"}
        </button>
      </div>

      {notice && (
        <div className="rounded border border-[#d8ccff] bg-[#f7f4ff] p-3 text-sm font-semibold text-[#4c00ff]">
          {notice}
        </div>
      )}

      {message && (
        <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {message}
        </div>
      )}
    </form>
  );
}
