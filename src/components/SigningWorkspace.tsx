/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { useRouter } from "next/navigation";
import OtpGate from "./OtpGate";
import { Icon } from "./Icons";
import { STYLE_FONTS, ensureSignatureFontsLoaded } from "./CreateSignatureModal";
import { EnvelopePdfViewer } from "./PdfPageCanvas";
import type { DocumentField } from "@/lib/types";

type Method = "typed" | "drawn" | "uploaded";

const SIGNATURE_TYPES = new Set([
  "signature",
  "initials",
  "witness_signature",
  "manager_signature",
  "office_admin_signature",
  "hr_signature",
  "notary_signature",
]);

function isSignatureField(field: DocumentField) {
  return SIGNATURE_TYPES.has(field.type);
}

function isInitialsField(field: DocumentField) {
  return field.type === "initials";
}

function isFullSignatureField(field: DocumentField) {
  return isSignatureField(field) && !isInitialsField(field);
}

function nameInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

export default function SigningWorkspace({
  token,
  documentSrc,
  title,
  fields,
  signerName,
  maskedEmail,
  signerPhone = "",
  requireOtp,
  alreadyVerified,
  accentColor = "#4c00ff",
  canSign,
}: {
  token: string;
  documentSrc: string;
  title: string;
  fields: DocumentField[];
  signerName: string;
  maskedEmail: string;
  signerPhone?: string;
  requireOtp: boolean;
  alreadyVerified: boolean;
  accentColor?: string;
  canSign: boolean;
}) {
  const router = useRouter();
  const padRef = useRef<SignatureCanvas | null>(null);
  const [verified, setVerified] = useState(alreadyVerified || !requireOtp);
  const [showAdoptModal, setShowAdoptModal] = useState(false);
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const [method, setMethod] = useState<Method>("typed");
  const [fullName, setFullName] = useState(signerName);
  const [initials, setInitials] = useState(nameInitials(signerName));
  const [typedStyleId, setTypedStyleId] = useState<string>(STYLE_FONTS[0].id);
  const [uploaded, setUploaded] = useState("");
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [adoptedSignature, setAdoptedSignature] = useState("");
  const [adoptedInitials, setAdoptedInitials] = useState("");
  /** false = Start tab at document top; true = moved to signature field line (DocuSign-style). */
  const [guideAtField, setGuideAtField] = useState(false);
  /** Consent + Finish only after scrolling to document end. */
  const [reachedEnd, setReachedEnd] = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() => {
    const today = new Date().toLocaleDateString();
    return Object.fromEntries(
      fields.map((field) => [
        field.id,
        field.type === "name" || field.type === "signer_name"
          ? signerName
          : field.type === "email" || field.type === "signer_email"
            ? maskedEmail
            : field.type === "date" || field.type === "signature_date" || field.type === "auto_date"
              ? today
              : field.type === "phone"
                ? String(field.value || signerPhone || "").trim()
                : field.value || "",
      ])
    );
  });
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);

  // Keep Name / Date / Phone filled for the signer (DocuSign-style autofill).
  useEffect(() => {
    const today = new Date().toLocaleDateString();
    setFieldValues((current) => {
      const next = { ...current };
      for (const field of fields) {
        if (field.type === "name" || field.type === "signer_name") next[field.id] = signerName;
        if (field.type === "date" || field.type === "signature_date" || field.type === "auto_date") {
          next[field.id] = next[field.id] || today;
        }
        if (field.type === "email" || field.type === "signer_email") next[field.id] = maskedEmail;
        if (field.type === "phone") {
          next[field.id] = String(next[field.id] || field.value || signerPhone || "").trim();
        } else if (!next[field.id] && field.value) {
          next[field.id] = field.value;
        }
      }
      return next;
    });
  }, [fields, signerName, maskedEmail, signerPhone]);

  const apiToken = encodeURIComponent(token);
  const selectedStyle = STYLE_FONTS.find((item) => item.id === typedStyleId) || STYLE_FONTS[0];
  const signatureFields = useMemo(() => fields.filter(isSignatureField), [fields]);
  const fullSignatureFields = useMemo(() => fields.filter(isFullSignatureField), [fields]);
  const initialsFields = useMemo(() => fields.filter(isInitialsField), [fields]);
  const otherFields = useMemo(() => fields.filter((field) => !isSignatureField(field)), [fields]);
  const firstRequired = fields.find((field) => field.required) || fields[0] || null;
  const needsFullSignature = fullSignatureFields.length > 0 && !adoptedSignature;
  const needsInitials = initialsFields.length > 0 && !adoptedInitials;
  const unsignedRequired = needsFullSignature || needsInitials;
  const finishRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    ensureSignatureFontsLoaded();
  }, []);

  useEffect(() => {
    function onFinishClick(event: Event) {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.("[data-finish-sign]")) {
        event.preventDefault();
        finishRef.current();
      }
    }
    document.addEventListener("click", onFinishClick);
    return () => document.removeEventListener("click", onFinishClick);
  }, []);

  if (!verified) {
    return <OtpGate token={token} maskedEmail={maskedEmail} onVerified={() => setVerified(true)} />;
  }

  function typedSignatureData(text: string, size = 48) {
    if (typeof document === "undefined") return "";
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 220;
    const context = canvas.getContext("2d");
    if (!context) return "";
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#1a1a1a";
    context.font = `${selectedStyle.weight} ${size}px ${selectedStyle.family}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text.trim(), canvas.width / 2, canvas.height / 2 + 8);
    return canvas.toDataURL("image/png");
  }

  function getSignatureData() {
    if (method === "uploaded") return uploaded;
    if (method === "typed") return fullName.trim() ? typedSignatureData(fullName, 44) : "";
    if (!padRef.current || padRef.current.isEmpty()) return "";
    try {
      return padRef.current.getTrimmedCanvas().toDataURL("image/png");
    } catch {
      return padRef.current.getCanvas().toDataURL("image/png");
    }
  }

  function previewData() {
    if (method === "uploaded" && uploaded) return uploaded;
    if (method === "typed" && fullName.trim()) return typedSignatureData(fullName, 36);
    return "";
  }

  function upload(file?: File) {
    setMessage("");
    if (!file) return setUploaded("");
    if (!["image/png", "image/jpeg"].includes(file.type)) return setMessage("Upload a PNG or JPG image.");
    if (file.size > 2 * 1024 * 1024) return setMessage("Signature image must be 2 MB or smaller.");
    const reader = new FileReader();
    reader.onload = () => setUploaded(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  }

  function isAutoFilledField(field: DocumentField) {
    return (
      field.type === "name" ||
      field.type === "signer_name" ||
      field.type === "email" ||
      field.type === "signer_email" ||
      field.type === "date" ||
      field.type === "signature_date" ||
      field.type === "auto_date"
    );
  }

  function isEditableDataField(field: DocumentField) {
    return (
      !isSignatureField(field) &&
      !isAutoFilledField(field) &&
      ["phone", "text", "checkbox", "radio_group", "signer_company", "signer_title", "number", "address"].includes(
        field.type
      )
    );
  }

  function fieldIsComplete(field: DocumentField) {
    if (!field.required) return true;
    if (isInitialsField(field)) return Boolean(adoptedInitials);
    if (isSignatureField(field)) return Boolean(adoptedSignature);
    const value = String(fieldValues[field.id] || "").trim();
    if (field.type === "checkbox" || field.type === "consent_checkbox") return value === "true";
    if (isAutoFilledField(field)) return Boolean(value);
    if (field.type === "phone") return Boolean(value || field.value || signerPhone);
    return Boolean(value);
  }

  function openSignField(field: DocumentField) {
    if (!canSign) return;
    setActiveFieldId(field.id);
    setMessage("");
    if (isSignatureField(field)) {
      setShowAdoptModal(true);
      padRef.current?.clear();
      return;
    }
    if (isEditableDataField(field)) {
      setEditingFieldId(field.id);
    }
  }

  function goToGuideField() {
    const target =
      (needsFullSignature ? fullSignatureFields[0] : null) ||
      (needsInitials ? initialsFields[0] : null) ||
      signatureFields[0] ||
      firstRequired;
    if (!target) return;
    setGuideAtField(true);
    const el = document.getElementById(`doc-field-${target.id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    window.setTimeout(() => openSignField(target), 450);
  }

  const guideField = unsignedRequired
    ? (needsFullSignature ? fullSignatureFields[0] : null) ||
      (needsInitials ? initialsFields[0] : null) ||
      signatureFields[0] ||
      firstRequired
    : null;
  const guidePage = guideAtField ? guideField?.page ?? 1 : 1;

  /** Scroll the PDF pane to the consent / finish block at the bottom. */
  function scrollToDocumentEnd() {
    const consent = document.getElementById("sign-consent");
    const scrollRoot = document.getElementById("sign-pdf-scroll");
    if (scrollRoot) {
      scrollRoot.scrollTo({ top: scrollRoot.scrollHeight, behavior: "smooth" });
    }
    consent?.scrollIntoView({ behavior: "smooth", block: "end" });
  }

  function adoptAndSign() {
    if (!initials.trim()) {
      setMessage("Enter your initials.");
      return;
    }
    const data = getSignatureData();
    if (!data) {
      setMessage(
        method === "drawn"
          ? "Please draw your signature."
          : method === "uploaded"
            ? "Please upload a signature image."
            : "Please enter your full name."
      );
      return;
    }
    // DocuSign-style: initials are always the short letters in the adopted style.
    const initialsInk = typedSignatureData(initials.trim().toUpperCase(), 36);
    if (!initialsInk) {
      setMessage("Could not create initials. Please try again.");
      return;
    }
    setAdoptedSignature(data);
    setAdoptedInitials(initialsInk);
    setShowAdoptModal(false);
    // Consent must stay unchecked until the signer ticks it at the end.
    setMessage("Signature applied. Scroll to the end, check the agreement box, then Finish.");
    if (activeFieldId) {
      const el = document.getElementById(`doc-field-${activeFieldId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  async function finish() {
    if (!canSign || busy) return;
    if (unsignedRequired) {
      goToGuideField();
      setMessage("Click Sign Here and adopt your signature first.");
      return;
    }
    if (!reachedEnd) {
      setMessage("Please scroll to the end of the document to finish.");
      scrollToDocumentEnd();
      return;
    }
    if (!consent) {
      setMessage("Please check the agreement box to continue.");
      document.getElementById("sign-consent")?.scrollIntoView({ behavior: "smooth", block: "center" });
      document.getElementById("sign-consent-check")?.focus();
      return;
    }
    const missing = otherFields.find((field) => !fieldIsComplete(field));
    if (missing) {
      setMessage(`Please complete: ${missing.label}.`);
      setEditingFieldId(missing.id);
      const el = document.getElementById(`doc-field-${missing.id}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setBusy(true);
    setMessage("Applying your signature...");
    try {
      const response = await fetch(`/api/sign/${apiToken}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consent: true,
          signatureMethod: method === "typed" ? "typed" : method === "uploaded" ? "uploaded" : "drawn",
          signatureData: adoptedSignature || getSignatureData(),
          initialsData: adoptedInitials || (initials.trim() ? typedSignatureData(initials.trim().toUpperCase(), 36) : ""),
          fieldValues,
          signatureStyleId: method === "typed" ? typedStyleId : undefined,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          timezoneOffsetMinutes: new Date().getTimezoneOffset(),
          signedAtLocal: new Intl.DateTimeFormat("en-US", {
            dateStyle: "medium",
            timeStyle: "long",
          }).format(new Date()),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(result.error || "Document could not be signed.");
        return;
      }
      router.replace(`/sign/${apiToken}/thanks`);
    } catch {
      setMessage("Connection error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  finishRef.current = () => {
    void finish();
  };

  async function decline() {
    const reason = window.prompt("Optional reason for declining:") || "No reason provided";
    setBusy(true);
    try {
      const response = await fetch(`/api/sign/${apiToken}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (response.ok) router.refresh();
      else setMessage("The decline could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  const livePreview = previewData();

  const consentPanel =
    canSign ? (
      <div
        id="sign-consent"
        className="rounded-xl border border-[#e7e2ec] bg-white p-4 shadow-sm sm:p-5"
      >
        <label className="flex items-start gap-3 text-[12px] leading-5 text-[#444] sm:text-[13px]">
          <input
            id="sign-consent-check"
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#4c00ff]"
          />
          I agree to conduct this transaction electronically and confirm that this signature is mine.
        </label>
        {message ? (
          <p className="mt-3 rounded bg-[#f5f5f5] px-3 py-2 text-[12px] font-semibold text-[#555]">{message}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-finish-sign
            onClick={() => void finish()}
            disabled={busy || !consent || !reachedEnd}
            className="rounded-[2px] bg-[#4c00ff] px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-[#3d00cf] disabled:opacity-50"
          >
            {busy ? "Processing…" : "Finish"}
          </button>
          <button
            type="button"
            onClick={() => void decline()}
            disabled={busy}
            className="text-[13px] font-semibold text-[#b33954]"
          >
            Decline to sign
          </button>
        </div>
        {!consent ? (
          <p className="mt-2 text-[11px] font-semibold text-[#666]">
            Check the box above to enable Finish.
          </p>
        ) : null}
      </div>
    ) : null;

  return (
    <div className="relative">
      {!reachedEnd && canSign ? (
        <button
          type="button"
          onClick={scrollToDocumentEnd}
          className="absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-full bg-[#21004c] px-4 py-2 text-[11px] font-semibold text-white shadow-lg hover:bg-[#160033] sm:text-[12px]"
        >
          Scroll to the end to finish
        </button>
      ) : null}

      <div className="relative overflow-hidden bg-[#e8e8ee]">
        <EnvelopePdfViewer
          src={documentSrc}
          title={title}
          fillHeight
          scrollRootId="sign-pdf-scroll"
          onNearEnd={setReachedEnd}
          endSlot={consentPanel}
          pageOverlay={(pageNumber) => {
            const pageFields = fields.filter((field) => field.page === pageNumber);
            const showGuide = Boolean(
              canSign && guideField && unsignedRequired && pageNumber === guidePage
            );
            if (!pageFields.length && !showGuide) return null;
            const guideTop = guideAtField && guideField
              ? `${guideField.y + Math.max(guideField.height, 5) / 2}%`
              : "1.25rem";
            return (
              <>
                {showGuide && guideField && (
                  <button
                    type="button"
                    id="sign-start-tab"
                    onClick={goToGuideField}
                    className="absolute z-40 left-1 inline-flex -translate-y-1/2 items-center bg-[#4c00ff] py-1.5 pl-2.5 pr-3 text-[12px] font-bold text-white shadow-lg transition-[top] duration-500 ease-out sm:left-[-3.75rem] sm:py-2 sm:pl-3 sm:pr-4 sm:text-[13px]"
                    style={{
                      top: guideTop,
                      clipPath: "polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)",
                    }}
                    title={guideAtField ? (guideField && isInitialsField(guideField) ? "Initial here" : "Sign here") : "Go to signature field"}
                  >
                    {guideAtField ? (guideField && isInitialsField(guideField) ? "Initial" : "Sign") : "Start"}
                  </button>
                )}
                {pageFields.map((field) => {
                  const isSign = isSignatureField(field);
                  const isInitial = isInitialsField(field);
                  const signed = isInitial
                    ? Boolean(adoptedInitials)
                    : isSign && Boolean(adoptedSignature);
                  const inkSrc = isInitial ? adoptedInitials : adoptedSignature;
                  const autoFilled = isAutoFilledField(field);
                  const editable = isEditableDataField(field);
                  const filledValue = String(fieldValues[field.id] || "").trim();
                  const displayValue = isSign
                    ? null
                    : filledValue || field.label;
                  const isGuideTarget = guideAtField && guideField?.id === field.id;
                  const needsValue = field.required && !isSign && !fieldIsComplete(field);

                  return (
                    <div
                      key={field.id}
                      className="absolute z-20 box-border"
                      style={{
                        left: `${field.x}%`,
                        top: `${field.y}%`,
                        width: `${field.width}%`,
                        height: `${Math.max(field.height, isSign ? 3.5 : 3)}%`,
                      }}
                    >
                      {isSign && !signed && (
                        <span className="pointer-events-none absolute -top-5 left-0 z-30 whitespace-nowrap rounded-sm bg-white/95 px-1.5 py-0.5 text-[10px] font-bold text-[#333] shadow">
                          {isInitial ? "Required — Initial Here" : "Required — Sign Here"}
                        </span>
                      )}
                      {needsValue && (
                        <span className="pointer-events-none absolute -top-5 left-0 z-30 whitespace-nowrap rounded-sm bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 shadow">
                          Required — tap to fill
                        </span>
                      )}
                      {isSign && !signed && !isGuideTarget && (
                        <span
                          className="pointer-events-none absolute -left-12 top-1/2 z-30 -translate-y-1/2 bg-[#4c00ff] py-1.5 pl-2 pr-3 text-[11px] font-bold text-white shadow"
                          style={{ clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%)" }}
                        >
                          {isInitial ? "Initial" : "Sign"}
                        </span>
                      )}
                      <button
                        id={`doc-field-${field.id}`}
                        type="button"
                        disabled={!canSign || autoFilled}
                        onClick={() => {
                          if (autoFilled) return;
                          openSignField(field);
                        }}
                        className={`flex h-full w-full items-center justify-center overflow-hidden rounded-[2px] border-2 bg-white/95 transition ${
                          canSign && (isSign || editable) ? "cursor-pointer hover:bg-[#f0ebff]" : "cursor-default"
                        } ${isGuideTarget && !signed ? "ring-2 ring-[#4c00ff]/40 ring-offset-1" : ""} ${
                          needsValue ? "border-dashed" : ""
                        }`}
                        style={{
                          borderColor: accentColor,
                          color: accentColor,
                        }}
                        title={isInitial ? "Click to adopt initials" : isSign ? "Click to sign here" : editable ? `Enter ${field.label}` : field.label}
                      >
                        {signed && inkSrc ? (
                          <img
                            src={inkSrc}
                            alt={isInitial ? "Your initials" : "Your signature"}
                            className="h-full w-full object-contain p-1"
                          />
                        ) : isSign ? (
                          <span className="flex flex-col items-center" style={{ color: accentColor }}>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                              <path
                                d="M4 20l3.5-1 11-11a2.1 2.1 0 0 0-3-3L4.5 16 3 20h1zm13.2-13.8l1.6 1.6"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                            <span className="mt-0.5 text-[10px] font-bold">{isInitial ? "Initial" : "Sign"}</span>
                          </span>
                        ) : field.type === "checkbox" ? (
                          <span className="flex items-center gap-1 text-[9px] font-bold" style={{ color: "#212121" }}>
                            <span className="inline-flex h-3 w-3 items-center justify-center border border-[#666] text-[8px]">
                              {filledValue === "true" ? "✓" : ""}
                            </span>
                            {field.label}
                          </span>
                        ) : field.type === "radio_group" ? (
                          <span className="text-[9px] font-bold" style={{ color: "#212121" }}>
                            ○ {displayValue || field.label}
                          </span>
                        ) : (
                          <span className="w-full truncate px-1.5 text-left text-[11px] font-semibold" style={{ color: "#212121" }}>
                            {displayValue}
                          </span>
                        )}
                      </button>
                    </div>
                  );
                })}
              </>
            );
          }}
        />
      </div>

      {editingFieldId && canSign && (() => {
        const field = fields.find((item) => item.id === editingFieldId);
        if (!field) return null;
        const options = field.options?.length ? field.options : ["Option 1", "Option 2"];
        return (
          <div className="fixed inset-0 z-[85] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal>
            <div className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#212121]">{field.label}</h2>
                  <p className="mt-1 text-[12px] text-[#666]">
                    {field.required ? "Required — enter a value to continue." : "Optional field."}
                  </p>
                </div>
                <button type="button" onClick={() => setEditingFieldId(null)} className="rounded p-1 text-[#666] hover:bg-[#f2f2f2]" aria-label="Close">
                  <Icon name="close" className="h-5 w-5" />
                </button>
              </div>

              {field.type === "checkbox" ? (
                <label className="mt-4 flex items-center gap-3 rounded-lg border border-[#e7e2ec] p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={fieldValues[field.id] === "true"}
                    onChange={(event) =>
                      setFieldValues((current) => ({ ...current, [field.id]: event.target.checked ? "true" : "" }))
                    }
                    className="h-4 w-4 accent-[#4c00ff]"
                  />
                  {field.tooltip || field.label}
                </label>
              ) : field.type === "radio_group" ? (
                <div className="mt-4 space-y-2">
                  {options.map((option) => (
                    <label key={option} className="flex items-center gap-3 rounded-lg border border-[#e7e2ec] p-3 text-sm">
                      <input
                        type="radio"
                        name={`radio-${field.id}`}
                        checked={fieldValues[field.id] === option}
                        onChange={() => setFieldValues((current) => ({ ...current, [field.id]: option }))}
                        className="h-4 w-4 accent-[#4c00ff]"
                      />
                      {option}
                    </label>
                  ))}
                </div>
              ) : (
                <input
                  type={field.type === "phone" ? "tel" : field.type === "number" ? "number" : "text"}
                  value={fieldValues[field.id] || ""}
                  onChange={(event) => setFieldValues((current) => ({ ...current, [field.id]: event.target.value }))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      if (field.required && !fieldIsComplete(field)) {
                        setMessage(`Please complete: ${field.label}.`);
                        return;
                      }
                      setEditingFieldId(null);
                      setMessage("");
                    }
                  }}
                  placeholder={field.type === "phone" ? "Enter phone number" : field.label}
                  className="mt-4 h-11 w-full rounded-lg border border-[#c6c6c6] px-3 text-sm outline-none focus:border-[#4c00ff]"
                  autoFocus
                />
              )}

              <button
                type="button"
                onClick={() => {
                  if (field.required && !fieldIsComplete(field)) {
                    setMessage(`Please complete: ${field.label}.`);
                    return;
                  }
                  setEditingFieldId(null);
                  setMessage("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (field.required && !fieldIsComplete(field)) {
                      setMessage(`Please complete: ${field.label}.`);
                      return;
                    }
                    setEditingFieldId(null);
                    setMessage("");
                  }
                }}
                className="mt-5 w-full rounded-[2px] bg-[#4c00ff] px-4 py-2.5 text-sm font-semibold text-white"
              >
                Save
              </button>
            </div>
          </div>
        );
      })()}

      {/* DocuSign-style Adopt Your Signature modal */}
      {showAdoptModal && canSign && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal>
          <div className="flex max-h-[95dvh] w-full max-w-[640px] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-lg">
            <div className="flex items-start justify-between border-b border-[#eee] px-5 py-4">
              <div>
                <h2 className="text-[20px] font-semibold text-[#212121]">Adopt Your Signature</h2>
                <p className="mt-1 text-[13px] text-[#666]">
                  Confirm your name, initials, and signature. <span className="text-[#c00]">*Required</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAdoptModal(false)}
                className="rounded p-1 text-[#666] hover:bg-[#f2f2f2]"
                aria-label="Close"
              >
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto px-5 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-[12px] font-semibold text-[#212121]">
                  Full Name<span className="text-[#c00]">*</span>
                  <input
                    value={fullName}
                    onChange={(event) => {
                      setFullName(event.target.value);
                      if (!initials || initials === nameInitials(signerName)) {
                        setInitials(nameInitials(event.target.value));
                      }
                    }}
                    className="mt-1 h-10 w-full rounded-[2px] border border-[#c6c6c6] px-3 text-sm outline-none focus:border-[#4c00ff]"
                  />
                </label>
                <label className="block text-[12px] font-semibold text-[#212121]">
                  Initials<span className="text-[#c00]">*</span>
                  <input
                    value={initials}
                    onChange={(event) => setInitials(event.target.value.toUpperCase().slice(0, 4))}
                    className="mt-1 h-10 w-full rounded-[2px] border border-[#c6c6c6] px-3 text-sm outline-none focus:border-[#4c00ff]"
                  />
                </label>
              </div>

              <div className="flex gap-1 border-b border-[#ddd]">
                {(
                  [
                    { id: "typed" as const, label: "SELECT STYLE" },
                    { id: "drawn" as const, label: "DRAW" },
                    { id: "uploaded" as const, label: "UPLOAD" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMethod(tab.id)}
                    className={`px-3 py-2.5 text-[12px] font-bold tracking-wide ${
                      method === tab.id ? "border-b-2 border-[#4c00ff] text-[#4c00ff]" : "text-[#666] hover:text-[#212121]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {method === "typed" && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-[#888]">Preview</p>
                  </div>
                  <div className="max-h-[220px] space-y-2 overflow-y-auto rounded border border-[#e5e5e5] p-2">
                    {STYLE_FONTS.map((style) => {
                      const selected = typedStyleId === style.id;
                      return (
                        <button
                          key={style.id}
                          type="button"
                          onClick={() => setTypedStyleId(style.id)}
                          className={`flex w-full items-center gap-3 rounded border px-3 py-3 text-left ${
                            selected ? "border-[#4c00ff] bg-[#f0ebff]" : "border-transparent hover:bg-[#fafafa]"
                          }`}
                        >
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                              selected ? "border-[#4c00ff] bg-[#4c00ff]" : "border-[#ccc]"
                            }`}
                          >
                            {selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[28px] leading-tight text-[#1a1a1a]" style={{ fontFamily: style.family, fontWeight: style.weight }}>
                            {fullName.trim() || "Your signature"}
                          </span>
                          <span
                            className="w-16 shrink-0 truncate text-center text-[22px] leading-tight text-[#1a1a1a]"
                            style={{ fontFamily: style.family, fontWeight: style.weight }}
                            title="Initials preview"
                          >
                            {initials.trim() || "IN"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {method === "drawn" && (
                <div>
                  <div className="overflow-hidden rounded-[2px] border-2 border-[#c6c6c6] bg-white">
                    <SignatureCanvas
                      ref={padRef}
                      penColor="#1a1a1a"
                      backgroundColor="white"
                      canvasProps={{ width: 600, height: 180, className: "h-40 w-full touch-none" }}
                    />
                  </div>
                  <button type="button" onClick={() => padRef.current?.clear()} className="mt-2 text-[12px] font-semibold text-[#4c00ff]">
                    Clear
                  </button>
                </div>
              )}

              {method === "uploaded" && (
                <label className="flex cursor-pointer flex-col items-center rounded-[2px] border-2 border-dashed border-[#c6c6c6] bg-[#fafafa] px-4 py-8 text-center hover:border-[#4c00ff]">
                  <Icon name="upload" className="h-7 w-7 text-[#4c00ff]" />
                  <span className="mt-2 text-sm font-semibold">Upload signature image</span>
                  <span className="mt-1 text-[12px] text-[#888]">PNG or JPG, up to 2 MB</span>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                    onChange={(event) => upload(event.target.files?.[0])}
                  />
                  {uploaded && <img src={uploaded} alt="Upload preview" className="mt-3 max-h-20" />}
                </label>
              )}

              {(livePreview || method === "drawn") && method !== "drawn" && livePreview && (
                <div className="grid gap-3 rounded border border-[#e5e5e5] bg-[#fafafa] p-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-[#888]">Signature</p>
                    <img src={livePreview} alt="Signature preview" className="mt-2 max-h-16" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-[#888]">Initials</p>
                    {initials.trim() ? (
                      <img
                        src={typedSignatureData(initials.trim().toUpperCase(), 72)}
                        alt="Initials preview"
                        className="mt-2 max-h-16"
                      />
                    ) : (
                      <p className="mt-2 text-[12px] text-[#999]">Enter initials above</p>
                    )}
                  </div>
                </div>
              )}
              {method === "drawn" ? (
                <div className="rounded border border-[#e5e5e5] bg-[#fafafa] p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-[#888]">Initials preview</p>
                  {initials.trim() ? (
                    <img
                      src={typedSignatureData(initials.trim().toUpperCase(), 72)}
                      alt="Initials preview"
                      className="mt-2 max-h-14"
                    />
                  ) : (
                    <p className="mt-2 text-[12px] text-[#999]">Enter initials above — they are applied separately from your signature.</p>
                  )}
                </div>
              ) : null}

              {message && showAdoptModal && <p className="text-[12px] font-semibold text-[#b33954]">{message}</p>}

              <p className="text-[11px] leading-4 text-[#666]">
                By selecting Adopt and Sign, I agree that the signature and initials will be the electronic representation of my
                signature for all purposes when I use them on documents.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-[#eee] bg-[#fafafa] px-5 py-4">
              <button
                type="button"
                onClick={adoptAndSign}
                className="rounded-[2px] bg-[#ffc820] px-5 py-2.5 text-[14px] font-bold text-[#212121] hover:bg-[#f0bc00]"
              >
                Adopt and Sign
              </button>
              <button type="button" onClick={() => setShowAdoptModal(false)} className="text-[14px] font-semibold text-[#4c00ff]">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
