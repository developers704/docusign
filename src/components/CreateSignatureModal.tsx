"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Icon } from "@/components/Icons";

const STORAGE_PREFIX = "va-user-signature:";

export type SavedSignature = {
  fullName: string;
  initials: string;
  styleId: string;
  method: "choose" | "draw" | "upload";
  signatureDataUrl: string;
  initialsDataUrl: string;
  updatedAt: string;
  userEmail?: string;
};

export const STYLE_FONTS = [
  { id: "dancing", family: '"Dancing Script", cursive', weight: 600, label: "Dancing Script" },
  { id: "great-vibes", family: '"Great Vibes", cursive', weight: 400, label: "Great Vibes" },
  { id: "pacifico", family: '"Pacifico", cursive', weight: 400, label: "Pacifico" },
  { id: "satisfy", family: '"Satisfy", cursive', weight: 400, label: "Satisfy" },
  { id: "allura", family: '"Allura", cursive', weight: 400, label: "Allura" },
  { id: "sacramento", family: '"Sacramento", cursive', weight: 400, label: "Sacramento" },
] as const;

export function ensureSignatureFontsLoaded() {
  if (typeof document === "undefined") return;
  const id = "va-signature-fonts";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Allura&family=Dancing+Script:wght@600&family=Great+Vibes&family=Pacifico&family=Sacramento&family=Satisfy&display=swap";
  document.head.appendChild(link);
}

function makeId() {
  return Math.random().toString(16).slice(2, 14).toUpperCase();
}

function storageKey(userEmail: string) {
  return `${STORAGE_PREFIX}${userEmail.trim().toLowerCase()}`;
}

function nameInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

/** Transparent PNG + dark ink, cropped tight so it sits next to the avatar */
function renderTextToDataUrl(text: string, fontFamily: string, fontSize: number, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#1a1a1a";
  ctx.font = `600 ${fontSize}px ${fontFamily}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const padX = 8;
  ctx.fillText(text, padX, height / 2 + 4);

  const metrics = ctx.measureText(text);
  const contentWidth = Math.ceil(padX + metrics.width + padX);
  const cropW = Math.min(width, Math.max(40, contentWidth));
  const cropped = document.createElement("canvas");
  cropped.width = cropW;
  cropped.height = height;
  const cropCtx = cropped.getContext("2d");
  if (!cropCtx) return canvas.toDataURL("image/png");
  cropCtx.drawImage(canvas, 0, 0, cropW, height, 0, 0, cropW, height);
  return cropped.toDataURL("image/png");
}

export function readSavedSignature(userEmail: string): SavedSignature | null {
  if (typeof window === "undefined" || !userEmail) return null;
  try {
    const raw = window.localStorage.getItem(storageKey(userEmail));
    if (!raw) return null;
    return JSON.parse(raw) as SavedSignature;
  } catch {
    return null;
  }
}

export function writeSavedSignature(userEmail: string, saved: SavedSignature) {
  if (typeof window === "undefined" || !userEmail) return;
  window.localStorage.setItem(storageKey(userEmail), JSON.stringify({ ...saved, userEmail }));
}

export default function CreateSignatureModal({
  defaultName,
  userEmail,
  onClose,
  onSaved,
}: {
  defaultName: string;
  userEmail: string;
  onClose: () => void;
  onSaved?: (signature: SavedSignature) => void;
}) {
  const existing = useMemo(() => readSavedSignature(userEmail), [userEmail]);
  const [tab, setTab] = useState<"choose" | "draw" | "upload">("choose");
  const [fullName, setFullName] = useState(existing?.fullName || defaultName);
  const [initials, setInitials] = useState(existing?.initials || nameInitials(defaultName));
  const [styleId, setStyleId] = useState(existing?.styleId || STYLE_FONTS[0].id);
  const [uploaded, setUploaded] = useState<string | null>(existing?.method === "upload" ? existing.signatureDataUrl : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const padRef = useRef<SignatureCanvas | null>(null);
  const stampIds = useMemo(() => STYLE_FONTS.map(() => makeId()), []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ensureSignatureFontsLoaded();
    // Always seed modal with this profile's name when no per-user signature yet
    if (!existing) {
      setFullName(defaultName);
      setInitials(nameInitials(defaultName));
    }
    return () => {
      document.body.style.overflow = previous;
    };
  }, [defaultName, existing]);

  function onNameChange(value: string) {
    setFullName(value);
    const auto = nameInitials(value);
    if (!initials || initials === existing?.initials || initials === nameInitials(defaultName)) {
      setInitials(auto);
    }
  }

  async function create() {
    setError("");
    if (!fullName.trim() || !initials.trim()) {
      setError("Full name and initials are required.");
      return;
    }
    setBusy(true);
    try {
      let signatureDataUrl = "";
      let initialsDataUrl = "";
      const style = STYLE_FONTS.find((item) => item.id === styleId) || STYLE_FONTS[0];

      if (tab === "choose") {
        signatureDataUrl = renderTextToDataUrl(fullName.trim(), style.family, 54, 640, 160);
        initialsDataUrl = renderTextToDataUrl(initials.trim(), style.family, 42, 200, 120);
      } else if (tab === "draw") {
        if (!padRef.current || padRef.current.isEmpty()) {
          setError("Please draw your signature.");
          setBusy(false);
          return;
        }
        signatureDataUrl = padRef.current.getTrimmedCanvas().toDataURL("image/png");
        initialsDataUrl = renderTextToDataUrl(initials.trim(), style.family, 42, 200, 120);
      } else {
        if (!uploaded) {
          setError("Upload a signature image (PNG or JPG).");
          setBusy(false);
          return;
        }
        signatureDataUrl = uploaded;
        initialsDataUrl = renderTextToDataUrl(initials.trim(), style.family, 42, 200, 120);
      }

      const saved: SavedSignature = {
        fullName: fullName.trim(),
        initials: initials.trim(),
        styleId: style.id,
        method: tab,
        signatureDataUrl,
        initialsDataUrl,
        updatedAt: new Date().toISOString(),
        userEmail: userEmail.trim().toLowerCase(),
      };
      writeSavedSignature(userEmail, saved);
      onSaved?.(saved);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-[#2a0a3d]/55 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Create Your Signature"
      onClick={onClose}
    >
      <div
        className="flex max-h-[100dvh] w-full max-w-[760px] flex-col overflow-hidden rounded-t-2xl bg-white shadow-[0_12px_40px_rgba(0,0,0,.35)] sm:max-h-[90vh] sm:rounded-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#e8e8e8] px-5 py-4">
          <h2 className="text-[20px] font-semibold text-[#212121]">Create Your Signature</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded text-[#666] hover:bg-[#f2f2f2]"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[13px] text-[#666]">
                Full Name <span className="text-red-600">*</span>
              </span>
              <input
                value={fullName}
                onChange={(event) => onNameChange(event.target.value)}
                className="h-11 w-full rounded-[2px] border border-[#c6c6c6] px-3 text-[15px] outline-none focus:border-[#4c00ff]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[13px] text-[#666]">
                Initials <span className="text-red-600">*</span>
              </span>
              <input
                value={initials}
                onChange={(event) => setInitials(event.target.value)}
                maxLength={6}
                className="h-11 w-full rounded-[2px] border border-[#c6c6c6] px-3 text-[15px] outline-none focus:border-[#4c00ff]"
              />
            </label>
          </div>

          <div className="mt-5 flex border-b border-[#e5e5e5]">
            {(
              [
                ["choose", "CHOOSE"],
                ["draw", "DRAW"],
                ["upload", "UPLOAD"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`px-4 py-2.5 text-[13px] font-bold tracking-[.04em] ${
                  tab === id ? "border-b-[3px] border-[#4c00ff] text-[#4c00ff]" : "border-b-[3px] border-transparent text-[#666]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-4">
            {tab === "choose" && (
              <div className="max-h-[340px] space-y-3 overflow-y-auto pr-1 scrollbar-thin">
                {STYLE_FONTS.map((style, index) => {
                  const selected = styleId === style.id;
                  return (
                    <label
                      key={style.id}
                      className="flex cursor-pointer items-center gap-3"
                    >
                      <input
                        type="radio"
                        name="signature-style"
                        checked={selected}
                        onChange={() => setStyleId(style.id)}
                        className="h-4 w-4 accent-[#4c00ff]"
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
                        <div
                          className={`relative min-h-[72px] flex-1 overflow-hidden rounded-[2px] border px-3 py-3 ${
                            selected ? "border-[#4c00ff]" : "border-[#c6c6c6]"
                          }`}
                        >
                          <span className="absolute -top-2 left-3 bg-white px-1 text-[10px] text-[#666]">Signed by:</span>
                          <p
                            className="truncate pt-1 text-[28px] leading-none text-[#1a1a1a] sm:text-[32px]"
                            style={{ fontFamily: style.family, fontWeight: style.weight }}
                          >
                            {fullName || "Your Name"}
                          </p>
                          <p className="mt-2 truncate text-[10px] tracking-wide text-[#9a93a8]">{stampIds[index]}</p>
                        </div>
                        <div
                          className={`relative flex h-[72px] w-full shrink-0 items-center justify-center overflow-hidden rounded-[2px] border sm:w-[100px] ${
                            selected ? "border-[#4c00ff]" : "border-[#c6c6c6]"
                          }`}
                        >
                          <span className="absolute -top-2 left-2 bg-white px-1 text-[10px] text-[#666]">DS</span>
                          <p
                            className="text-[26px] leading-none text-[#1a1a1a]"
                            style={{ fontFamily: style.family, fontWeight: style.weight }}
                          >
                            {initials || "IN"}
                          </p>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            {tab === "draw" && (
              <div>
                <div className="overflow-hidden rounded-[2px] border border-[#c6c6c6] bg-white">
                  <SignatureCanvas
                    ref={padRef}
                    penColor="#1a1a1a"
                    backgroundColor="#ffffff"
                    canvasProps={{ className: "h-44 w-full touch-none sm:h-52" }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => padRef.current?.clear()}
                  className="mt-2 text-[13px] font-semibold text-[#4c00ff] hover:underline"
                >
                  Clear
                </button>
              </div>
            )}

            {tab === "upload" && (
              <div>
                <label className="flex cursor-pointer flex-col items-center rounded-[2px] border-2 border-dashed border-[#c6c6c6] bg-[#fafafa] px-4 py-10 text-center hover:border-[#4c00ff]">
                  <Icon name="upload" className="h-7 w-7 text-[#4c00ff]" />
                  <span className="mt-2 text-[14px] font-semibold">Upload signature image</span>
                  <span className="mt-1 text-[12px] text-[#666]">PNG or JPG, up to 2 MB</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      if (file.size > 2 * 1024 * 1024) {
                        setError("Image must be 2 MB or smaller.");
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => setUploaded(String(reader.result || ""));
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
                {uploaded && (
                  <div className="mt-3 rounded-[2px] border border-[#e5e5e5] bg-white p-3 text-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={uploaded} alt="Uploaded signature preview" className="mx-auto max-h-24" />
                  </div>
                )}
              </div>
            )}
          </div>

          {error && <p className="mt-3 text-[13px] text-red-700">{error}</p>}
        </div>

        <div className="shrink-0 border-t border-[#e8e8e8] px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <p className="text-[11px] leading-4 text-[#666]">
            By clicking Create, I agree that the signature and initials will be the electronic representation of my
            signature and initials for all purposes when I (or my agent) use them on envelopes, including legally
            binding contracts.
          </p>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              disabled={busy}
              onClick={() => void create()}
              className="inline-flex h-10 min-w-[110px] items-center justify-center rounded-[2px] bg-[#4c00ff] px-6 text-[14px] font-semibold text-white hover:bg-[#3d00cf] disabled:opacity-60"
            >
              {busy ? "Saving…" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
