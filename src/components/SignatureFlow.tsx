/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { useRouter } from "next/navigation";
import OtpGate from "./OtpGate";
import { Icon } from "./Icons";
import { STYLE_FONTS, ensureSignatureFontsLoaded } from "./CreateSignatureModal";
import type { DocumentField } from "@/lib/types";

type Method = "drawn" | "typed" | "uploaded";

export default function SignatureFlow({
  token,
  signerName,
  maskedEmail,
  requireOtp,
  alreadyVerified,
  fields = [],
  documentTitle = "Document",
}: {
  token: string;
  signerName: string;
  maskedEmail: string;
  requireOtp: boolean;
  alreadyVerified: boolean;
  fields?: DocumentField[];
  documentTitle?: string;
}) {
  const router = useRouter();
  const padRef = useRef<SignatureCanvas | null>(null);
  const [verified, setVerified] = useState(alreadyVerified || !requireOtp);
  const [method, setMethod] = useState<Method>("drawn");
  const [typedName, setTypedName] = useState(signerName);
  const [typedStyleId, setTypedStyleId] = useState<string>(STYLE_FONTS[0].id);
  const [uploaded, setUploaded] = useState("");
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields.map((field) => [
        field.id,
        field.type === "name" || field.type === "signer_name"
          ? signerName
          : field.type === "email" || field.type === "signer_email"
            ? maskedEmail
            : field.type === "date" || field.type === "signature_date" || field.type === "auto_date"
              ? new Date().toLocaleDateString()
              : field.value || "",
      ])
    )
  );

  const apiToken = encodeURIComponent(token);
  const selectedStyle = STYLE_FONTS.find((item) => item.id === typedStyleId) || STYLE_FONTS[0];

  useEffect(() => {
    ensureSignatureFontsLoaded();
  }, []);

  if (!verified) return <OtpGate token={token} maskedEmail={maskedEmail} onVerified={() => setVerified(true)} />;

  function typedSignatureData() {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 220;
    const context = canvas.getContext("2d");
    if (!context) return "";
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#1a1a1a";
    context.font = `${selectedStyle.weight} 92px ${selectedStyle.family}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(typedName.trim(), canvas.width / 2, canvas.height / 2 + 8);
    return canvas.toDataURL("image/png");
  }

  function getSignatureData() {
    if (method === "uploaded") return uploaded;
    if (method === "typed") return typedName.trim() ? typedSignatureData() : "";
    if (!padRef.current || padRef.current.isEmpty()) return "";
    try {
      return padRef.current.getTrimmedCanvas().toDataURL("image/png");
    } catch {
      return padRef.current.getCanvas().toDataURL("image/png");
    }
  }

  function upload(file?: File) {
    setMessage("");
    if (!file) return setUploaded("");
    if (!["image/png", "image/jpeg"].includes(file.type)) return setMessage("Upload a PNG, JPG, or JPEG image.");
    if (file.size > 2 * 1024 * 1024) return setMessage("Signature image must be 2 MB or smaller.");
    const reader = new FileReader();
    reader.onload = () => setUploaded(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  }

  async function sign() {
    if (!consent) return setMessage("Please accept the electronic-signature consent.");
    const missing = fields.find(
      (field) => field.required && !["signature", "initials"].includes(field.type) && !String(fieldValues[field.id] || "").trim()
    );
    if (missing) return setMessage(`Please complete the required field: ${missing.label}.`);
    const signatureData = getSignatureData();
    if (!signatureData) return setMessage("Please provide your signature.");
    setBusy(true);
    setMessage("Applying your signature...");
    try {
      const response = await fetch(`/api/sign/${apiToken}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consent: true,
          signatureMethod: method,
          signatureData,
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
      const result = (await response.json()) as { error?: string; completed?: boolean };
      if (!response.ok) return setMessage(result.error || "Document could not be signed.");
      window.location.assign(`/sign/${apiToken}/thanks`);
      return;
    } catch {
      setMessage("Connection error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

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

  return (
    <section className="overflow-hidden rounded-2xl border border-[#e4dee8] bg-white app-shadow">
      <div className="border-b border-[#eee9f1] px-5 py-4">
        <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#4c00ff]">Finish contract</p>
        <h2 className="mt-1 text-lg font-extrabold">Adopt your signature</h2>
      </div>
      <div className="p-5">
        <div id="sign-pad" className="scroll-mt-24 rounded-xl transition">
        <div className="grid grid-cols-3 gap-2">
          {(["drawn", "typed", "uploaded"] as Method[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMethod(item)}
              className={`rounded-xl border px-2 py-3 text-center text-[11px] font-extrabold capitalize transition ${
                method === item
                  ? "border-[#4c00ff] bg-[#f0eaff] text-[#4c00ff] ring-2 ring-[#e4d9ff]"
                  : "border-[#e5dfe8] text-[#74697c] hover:bg-[#faf8fc]"
              }`}
            >
              {item === "drawn" ? "Draw" : item === "typed" ? "Type" : "Upload"}
            </button>
          ))}
        </div>
        {method === "drawn" && (
          <div className="mt-4">
            <div className="overflow-hidden rounded-xl border-2 border-[#dcd4e1] bg-white">
              <SignatureCanvas
                ref={padRef}
                penColor="black"
                backgroundColor="white"
                canvasProps={{ width: 700, height: 200, className: "h-44 w-full" }}
              />
            </div>
            <button type="button" onClick={() => padRef.current?.clear()} className="mt-2 text-[11px] font-extrabold text-[#4c00ff]">
              Clear signature
            </button>
          </div>
        )}
        {method === "typed" && (
          <div className="mt-4">
            <label className="block text-[11px] font-extrabold text-[#574d60]">
              Full name
              <input
                value={typedName}
                onChange={(event) => setTypedName(event.target.value)}
                className="mt-2 w-full rounded-xl border border-[#ddd6e2] px-3 py-2.5 text-sm font-normal outline-none focus:border-[#7d52ff]"
              />
            </label>
            <p className="mt-4 text-[10px] font-extrabold uppercase tracking-[.14em] text-[#4c00ff]">Choose a style</p>
            <div className="mt-2 max-h-[280px] space-y-2 overflow-y-auto pr-1">
              {STYLE_FONTS.map((style) => {
                const selected = typedStyleId === style.id;
                return (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => setTypedStyleId(style.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
                      selected
                        ? "border-[#4c00ff] bg-[#f5f0ff] ring-2 ring-[#e4d9ff]"
                        : "border-[#e5dfe8] bg-white hover:bg-[#faf8fc]"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                        selected ? "border-[#4c00ff] bg-[#4c00ff]" : "border-[#cfc7d6] bg-white"
                      }`}
                      aria-hidden
                    >
                      {selected ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
                    </span>
                    <span
                      className="min-w-0 flex-1 truncate text-[28px] leading-tight text-[#1a1a1a]"
                      style={{ fontFamily: style.family, fontWeight: style.weight }}
                    >
                      {typedName.trim() || "Your signature"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {method === "uploaded" && (
          <div className="mt-4">
            <label className="flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-[#d6cbe0] bg-[#faf8fc] px-4 py-7 text-center">
              <Icon name="upload" className="h-6 w-6 text-[#4c00ff]" />
              <span className="mt-2 text-xs font-extrabold">Upload signature image</span>
              <span className="mt-1 text-[10px] text-[#918798]">PNG or JPG, up to 2 MB</span>
              <input
                type="file"
                className="hidden"
                accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                onChange={(event) => upload(event.target.files?.[0])}
              />
            </label>
            {uploaded && (
              <div className="mt-3 rounded-xl border bg-white p-3 text-center">
                <img src={uploaded} alt="Uploaded signature preview" className="mx-auto max-h-24" />
              </div>
            )}
          </div>
        )}
        </div>
        {fields.some((field) => !["signature", "initials"].includes(field.type)) && (
          <div className="mt-5 rounded-xl border border-[#e7e1eb] bg-[#faf8fc] p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#4c00ff]">Required document fields</p>
            <div className="mt-3 space-y-3">
              {fields
                .filter((field) => !["signature", "initials"].includes(field.type))
                .map((field) => (
                  <label
                    key={field.id}
                    id={`sign-field-${field.id}`}
                    className="block scroll-mt-24 rounded-lg text-[11px] font-extrabold text-[#574d60] transition"
                  >
                    {field.label}
                    {field.required && <span className="text-red-600"> *</span>}
                    {field.type === "checkbox" || field.type === "consent_checkbox" ? (
                      <span className="mt-2 flex items-center gap-2 rounded-lg border bg-white p-3">
                        <input
                          type="checkbox"
                          checked={fieldValues[field.id] === "true"}
                          onChange={(event) =>
                            setFieldValues((current) => ({ ...current, [field.id]: event.target.checked ? "true" : "" }))
                          }
                          className="h-4 w-4 accent-[#4c00ff]"
                        />
                        <span className="font-normal">{field.tooltip || "I agree"}</span>
                      </span>
                    ) : field.type === "radio_group" ? (
                      <div className="mt-2 space-y-2 rounded-lg border bg-white p-3">
                        {(field.options?.length ? field.options : ["Option 1", "Option 2"]).map((option) => (
                          <label key={option} className="flex items-center gap-2 text-[12px] font-normal">
                            <input
                              type="radio"
                              name={`sf-radio-${field.id}`}
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
                        type={
                          field.type === "date" || field.type === "signature_date" || field.type === "auto_date"
                            ? "date"
                            : field.type === "number"
                              ? "number"
                              : field.type === "phone"
                                ? "tel"
                                : "text"
                        }
                        value={fieldValues[field.id] || ""}
                        readOnly={["name", "email", "signer_name", "signer_email"].includes(field.type)}
                        onChange={(event) => setFieldValues((current) => ({ ...current, [field.id]: event.target.value }))}
                        placeholder={field.tooltip || field.label}
                        className="mt-2 w-full rounded-lg border border-[#ddd6e2] bg-white px-3 py-2.5 text-xs font-normal read-only:bg-[#f1edf3]"
                      />
                    )}
                  </label>
                ))}
            </div>
          </div>
        )}
        <label className="mt-5 flex items-start gap-3 rounded-xl border border-[#e7e1eb] bg-[#faf8fc] p-3">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#4c00ff]"
          />
          <span className="text-[11px] leading-5 text-[#675c71]">
            I agree to conduct this transaction electronically and confirm that this signature is mine.
          </span>
        </label>
        {message && <p className="mt-4 rounded-xl bg-[#f5f2f7] p-3 text-[11px] font-semibold text-[#675c71]">{message}</p>}
        <button
          type="button"
          onClick={sign}
          disabled={busy}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#4c00ff] px-4 py-3 text-sm font-extrabold text-white shadow-lg shadow-violet-200 disabled:opacity-50"
        >
          {busy ? (
            "Processing..."
          ) : (
            <>
              Agree & sign <Icon name="arrow" className="h-4 w-4" />
            </>
          )}
        </button>
        <button
          type="button"
          onClick={decline}
          disabled={busy}
          className="mt-2 w-full rounded-xl px-4 py-2 text-xs font-extrabold text-[#b33954] hover:bg-red-50"
        >
          Decline to sign
        </button>
      </div>
    </section>
  );
}
