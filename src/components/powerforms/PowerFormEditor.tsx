"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { PowerFormAccessType, PowerFormCustomIntakeField, TemplateRecord } from "@/lib/types";
import { templateHasSigningFields } from "@/lib/templateSigningFields";
import TemplateFieldPlacer, { type PlacedFieldPayload } from "@/components/powerforms/TemplateFieldPlacer";

type Props = {
  templates: TemplateRecord[];
  officeNames?: Record<string, string>;
  offices?: Array<{ id: string; name: string }>;
  defaultTemplateId?: string;
  defaultOfficeId?: string;
  mode: "create" | "edit";
  initial?: {
    id: string;
    name: string;
    slug: string;
    description: string;
    templateId: string;
    accessType: PowerFormAccessType;
    collectName: boolean;
    collectEmail: boolean;
    collectPhone: boolean;
    collectEmployeeId: boolean;
    requireConsent: boolean;
    consentText: string;
    successMessage: string;
    submissionLimit: number | null;
    customIntakeFields: PowerFormCustomIntakeField[];
    status: string;
  };
};

export default function PowerFormEditor({
  templates,
  officeNames = {},
  offices = [],
  defaultTemplateId,
  defaultOfficeId,
  mode,
  initial,
}: Props) {
  const router = useRouter();
  const [officeFilter, setOfficeFilter] = useState(() => {
    if (defaultOfficeId) return defaultOfficeId;
    const seedTemplateId = initial?.templateId || defaultTemplateId;
    if (seedTemplateId) {
      return templates.find((t) => t.id === seedTemplateId)?.officeId || "";
    }
    return "";
  });

  const published = useMemo(() => {
    return templates
      .filter((t) => t.status === "published")
      .filter((t) => (officeFilter ? t.officeId === officeFilter : true))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [templates, officeFilter]);

  const [templateId, setTemplateId] = useState(
    initial?.templateId ||
      defaultTemplateId ||
      templates.find((t) => t.status === "published" && (!defaultOfficeId || t.officeId === defaultOfficeId))?.id ||
      ""
  );
  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) || null,
    [templates, templateId]
  );
  const [placedFields, setPlacedFields] = useState<PlacedFieldPayload[]>([]);
  const [placedHasSigning, setPlacedHasSigning] = useState(false);
  const [name, setName] = useState(initial?.name || "");
  const [slug, setSlug] = useState(initial?.slug || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [accessType, setAccessType] = useState<PowerFormAccessType>(initial?.accessType || "public");
  const [accessCode, setAccessCode] = useState("");
  const [collectName, setCollectName] = useState(initial?.collectName ?? true);
  const [collectEmail, setCollectEmail] = useState(initial?.collectEmail ?? true);
  const [collectPhone, setCollectPhone] = useState(initial?.collectPhone ?? false);
  const [collectEmployeeId, setCollectEmployeeId] = useState(initial?.collectEmployeeId ?? false);
  const [requireConsent, setRequireConsent] = useState(initial?.requireConsent ?? false);
  const [consentText, setConsentText] = useState(initial?.consentText || "I agree to use electronic records and signatures.");
  const [successMessage, setSuccessMessage] = useState(
    initial?.successMessage || "Thank you. Opening your document to sign…"
  );
  const [submissionLimit, setSubmissionLimit] = useState(
    initial?.submissionLimit != null ? String(initial.submissionLimit) : ""
  );
  const [customFields, setCustomFields] = useState<PowerFormCustomIntakeField[]>(
    initial?.customIntakeFields || []
  );
  const [publish, setPublish] = useState(mode === "create");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function addCustomField() {
    const key = `custom_${customFields.length + 1}`;
    setCustomFields((prev) => [
      ...prev,
      { id: crypto.randomUUID(), key, label: `Custom field ${prev.length + 1}`, type: "text", required: false },
    ]);
  }

  function onOfficeChange(nextOfficeId: string) {
    setOfficeFilter(nextOfficeId);
    const nextPublished = templates.filter(
      (t) => t.status === "published" && (nextOfficeId ? t.officeId === nextOfficeId : true)
    );
    if (!nextPublished.some((t) => t.id === templateId)) {
      setTemplateId(nextPublished[0]?.id || "");
    }
  }

  async function onSubmit(event: FormEvent, asPublish?: boolean) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!templateId) {
        setError("Select a published template.");
        setBusy(false);
        return;
      }
      if (mode === "create") {
        if (!placedHasSigning || !placedFields.length) {
          setError("Document pe Signature ya Initials field wahan place karein jahan sign chahiye.");
          setBusy(false);
          return;
        }
      }
      const payload = {
        templateId,
        name,
        slug: slug || undefined,
        description,
        accessType,
        accessCode: accessCode || undefined,
        collectName,
        collectEmail,
        collectPhone,
        collectEmployeeId,
        requireConsent,
        consentText,
        successMessage,
        submissionLimit: submissionLimit ? Number(submissionLimit) : null,
        customIntakeFields: customFields,
        publish: asPublish ?? publish,
        placedFields: mode === "create" ? placedFields : undefined,
        replaceTemplateFields: mode === "create",
      };
      const url = mode === "create" ? "/api/admin/powerforms" : `/api/admin/powerforms/${initial!.id}`;
      const response = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { error?: string; id?: string };
      if (!response.ok) {
        setError(data.error || "Unable to save PowerForm.");
        return;
      }
      router.push(data.id ? `/powerforms/manage/${data.id}` : "/powerforms");
      router.refresh();
    } catch {
      setError("Unable to save PowerForm.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => onSubmit(e)} className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-lg border border-[#e7e2ec] bg-white p-5">
        <h2 className="text-[16px] font-semibold text-[#21004c]">1. Workspace & template</h2>
        <p className="mt-1 text-[13px] text-[#6b6578]">
          Choose a workspace and published template. If the template has no signature fields, add them below.
        </p>

        {offices.length > 0 ? (
          <>
            <label className="mt-3 block text-[12px] font-semibold uppercase text-[#666]">Workspace</label>
            <select
              value={officeFilter}
              onChange={(e) => onOfficeChange(e.target.value)}
              disabled={mode === "edit"}
              className="mt-1 h-10 w-full rounded-[2px] border border-[#c6c6c6] px-3 text-[14px]"
            >
              <option value="">All workspaces</option>
              {offices.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </>
        ) : null}

        <label className="mt-3 block text-[12px] font-semibold uppercase text-[#666]">Template</label>
        <select
          required
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          disabled={mode === "edit"}
          className="mt-1 h-10 w-full rounded-[2px] border border-[#c6c6c6] px-3 text-[14px]"
        >
          <option value="">Select template…</option>
          {published.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
              {officeNames[template.officeId] ? ` · ${officeNames[template.officeId]}` : ""}
              {templateHasSigningFields(template) ? "" : " (add fields)"}
            </option>
          ))}
        </select>

        {!published.length ? (
          <div className="mt-3 rounded border border-[#f5c2c7] bg-[#fff5f5] px-3 py-2 text-[13px] text-[#b00020]">
            No published templates in this workspace.{" "}
            <Link href="/templates" className="font-semibold underline">
              Open Templates
            </Link>
          </div>
        ) : null}

        {selectedTemplate && mode === "create" ? (
          <div className="mt-4">
            <TemplateFieldPlacer
              key={selectedTemplate.id}
              template={selectedTemplate}
              onFieldsChange={(nextFields, hasSigning) => {
                setPlacedFields(nextFields);
                setPlacedHasSigning(hasSigning);
              }}
            />
          </div>
        ) : selectedTemplate && templateHasSigningFields(selectedTemplate) ? (
          <p className="mt-2 text-[12px] text-emerald-700">Template already has signing fields.</p>
        ) : null}
      </section>

      <section className="rounded-lg border border-[#e7e2ec] bg-white p-5">
        <h2 className="text-[16px] font-semibold text-[#21004c]">2. Name & link</h2>
        <label className="mt-3 block text-[12px] font-semibold uppercase text-[#666]">Name</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 h-10 w-full rounded-[2px] border border-[#c6c6c6] px-3 text-[14px]"
        />
        <label className="mt-3 block text-[12px] font-semibold uppercase text-[#666]">Slug</label>
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="auto-generated-from-name"
          className="mt-1 h-10 w-full rounded-[2px] border border-[#c6c6c6] px-3 text-[14px]"
        />
        <label className="mt-3 block text-[12px] font-semibold uppercase text-[#666]">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-[2px] border border-[#c6c6c6] px-3 py-2 text-[14px]"
        />
      </section>

      <section className="rounded-lg border border-[#e7e2ec] bg-white p-5">
        <h2 className="text-[16px] font-semibold text-[#21004c]">3. Access</h2>
        <select
          value={accessType}
          onChange={(e) => setAccessType(e.target.value as PowerFormAccessType)}
          className="mt-3 h-10 w-full rounded-[2px] border border-[#c6c6c6] px-3 text-[14px]"
        >
          <option value="public">Public link</option>
          <option value="access_code">Private access code</option>
          <option value="email_verified">Email verification</option>
        </select>
        {accessType === "access_code" ? (
          <>
            <label className="mt-3 block text-[12px] font-semibold uppercase text-[#666]">
              {mode === "edit" ? "New access code (leave blank to keep)" : "Access code"}
            </label>
            <input
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              required={mode === "create"}
              className="mt-1 h-10 w-full rounded-[2px] border border-[#c6c6c6] px-3 text-[14px]"
            />
          </>
        ) : null}
      </section>

      <section className="rounded-lg border border-[#e7e2ec] bg-white p-5">
        <h2 className="text-[16px] font-semibold text-[#21004c]">4. Intake fields</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {[
            ["Name", collectName, setCollectName],
            ["Email", collectEmail, setCollectEmail],
            ["Phone", collectPhone, setCollectPhone],
            ["Employee ID", collectEmployeeId, setCollectEmployeeId],
          ].map(([label, value, setter]) => (
            <label key={String(label)} className="flex items-center gap-2 text-[14px] text-[#1c1230]">
              <input
                type="checkbox"
                checked={Boolean(value)}
                onChange={(e) => (setter as (v: boolean) => void)(e.target.checked)}
              />
              {label as string}
            </label>
          ))}
        </div>
        <div className="mt-4 space-y-3">
          {customFields.map((field, index) => (
            <div key={field.id} className="grid gap-2 rounded border border-[#eee] p-3 sm:grid-cols-3">
              <input
                value={field.label}
                onChange={(e) => {
                  const next = [...customFields];
                  next[index] = { ...field, label: e.target.value };
                  setCustomFields(next);
                }}
                className="h-9 rounded border border-[#c6c6c6] px-2 text-[13px]"
                placeholder="Label"
              />
              <input
                value={field.key}
                onChange={(e) => {
                  const next = [...customFields];
                  next[index] = { ...field, key: e.target.value };
                  setCustomFields(next);
                }}
                className="h-9 rounded border border-[#c6c6c6] px-2 text-[13px]"
                placeholder="key"
              />
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) => {
                    const next = [...customFields];
                    next[index] = { ...field, required: e.target.checked };
                    setCustomFields(next);
                  }}
                />
                Required
              </label>
            </div>
          ))}
          <button type="button" onClick={addCustomField} className="text-[13px] font-semibold text-[#4c00ff]">
            + Add custom field
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-[#e7e2ec] bg-white p-5">
        <h2 className="text-[16px] font-semibold text-[#21004c]">5. Options</h2>
        <label className="mt-3 flex items-center gap-2 text-[14px]">
          <input type="checkbox" checked={requireConsent} onChange={(e) => setRequireConsent(e.target.checked)} />
          Require consent checkbox
        </label>
        {requireConsent ? (
          <textarea
            value={consentText}
            onChange={(e) => setConsentText(e.target.value)}
            rows={2}
            className="mt-2 w-full rounded-[2px] border border-[#c6c6c6] px-3 py-2 text-[14px]"
          />
        ) : null}
        <label className="mt-3 block text-[12px] font-semibold uppercase text-[#666]">Success message</label>
        <input
          value={successMessage}
          onChange={(e) => setSuccessMessage(e.target.value)}
          className="mt-1 h-10 w-full rounded-[2px] border border-[#c6c6c6] px-3 text-[14px]"
        />
        <label className="mt-3 block text-[12px] font-semibold uppercase text-[#666]">Submission limit (optional)</label>
        <input
          type="number"
          min={1}
          value={submissionLimit}
          onChange={(e) => setSubmissionLimit(e.target.value)}
          className="mt-1 h-10 w-40 rounded-[2px] border border-[#c6c6c6] px-3 text-[14px]"
        />
        {mode === "create" ? (
          <label className="mt-3 flex items-center gap-2 text-[14px]">
            <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
            Publish immediately
          </label>
        ) : null}
      </section>

      {error ? <p className="text-[14px] font-medium text-[#b00020]">{error}</p> : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          {...(busy || published.length === 0 ? { disabled: true as const } : {})}
          className="h-10 rounded-[2px] bg-[#4c00ff] px-5 text-[14px] font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Saving…" : mode === "create" ? "Create PowerForm" : "Save changes"}
        </button>
        {mode === "edit" && initial?.status !== "published" ? (
          <button
            type="button"
            {...(busy ? { disabled: true as const } : {})}
            onClick={(e) => onSubmit(e as unknown as FormEvent, true)}
            className="h-10 rounded-[2px] border border-[#4c00ff] px-5 text-[14px] font-semibold text-[#4c00ff]"
          >
            Save & publish
          </button>
        ) : null}
      </div>
    </form>
  );
}
