"use client";

import type { DocumentField } from "@/lib/types";
import { EnvelopePdfViewer } from "./PdfPageCanvas";

const SIGNATURE_TYPES = new Set([
  "signature",
  "initials",
  "witness_signature",
  "manager_signature",
  "office_admin_signature",
  "hr_signature",
  "notary_signature",
]);

function fieldActionLabel(field: DocumentField) {
  if (SIGNATURE_TYPES.has(field.type)) {
    return field.type === "initials" ? "Initial" : "Sign";
  }
  return field.label || "Fill";
}

export default function SignDocumentOverlay({
  src,
  title,
  fields,
  signerName,
  accentColor = "#4c00ff",
  interactive = true,
}: {
  src: string;
  title: string;
  fields: DocumentField[];
  signerName: string;
  accentColor?: string;
  interactive?: boolean;
}) {
  function activateField(field: DocumentField) {
    if (!interactive) return;
    const finish = document.getElementById("finish-signing");
    finish?.scrollIntoView({ behavior: "smooth", block: "start" });
    const isSign = SIGNATURE_TYPES.has(field.type);
    const target =
      document.getElementById(`sign-field-${field.id}`) ||
      (isSign ? document.getElementById("sign-pad") : null) ||
      finish;
    if (target && target !== finish) {
      target.classList.add("ring-4", "ring-[#4c00ff]", "ring-offset-2");
      window.setTimeout(() => target.classList.remove("ring-4", "ring-[#4c00ff]", "ring-offset-2"), 1800);
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  const firstRequired = fields.find((field) => field.required) || fields[0];

  return (
    <div className="relative">
      {interactive && firstRequired && (
        <button
          type="button"
          onClick={() => {
            const el = document.getElementById(`doc-field-${firstRequired.id}`);
            el?.scrollIntoView({ behavior: "smooth", block: "center" });
            activateField(firstRequired);
          }}
          className="absolute -left-2 top-8 z-20 inline-flex items-center gap-1 rounded-[2px] bg-[#4c00ff] px-3 py-1.5 text-[12px] font-bold text-white shadow sm:-left-14"
        >
          Start
          <span aria-hidden>→</span>
        </button>
      )}

      <EnvelopePdfViewer
        src={src}
        title={title}
        pageOverlay={(pageNumber) => {
          const pageFields = fields.filter((field) => field.page === pageNumber);
          if (!pageFields.length) return null;
          return (
            <>
              {pageFields.map((field) => {
                const isSign = SIGNATURE_TYPES.has(field.type);
                return (
                  <button
                    key={field.id}
                    id={`doc-field-${field.id}`}
                    type="button"
                    disabled={!interactive}
                    onClick={() => activateField(field)}
                    className={`absolute z-10 flex select-none flex-col overflow-visible rounded-sm border-2 text-left shadow-md transition ${
                      interactive ? "cursor-pointer hover:brightness-95" : "cursor-default"
                    }`}
                    style={{
                      left: `${field.x}%`,
                      top: `${field.y}%`,
                      width: `${Math.max(field.width, 12)}%`,
                      height: `${Math.max(field.height, 4)}%`,
                      borderColor: accentColor,
                      backgroundColor: `${accentColor}18`,
                      color: accentColor,
                    }}
                    title={`${field.label} · ${signerName}`}
                  >
                    {isSign && (
                      <span
                        className="absolute -left-1 top-0 z-20 -translate-x-full rounded-l-sm px-1.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white shadow"
                        style={{ backgroundColor: accentColor }}
                      >
                        {fieldActionLabel(field)}
                      </span>
                    )}
                    <span className="flex h-full w-full flex-col items-center justify-center px-1">
                      <span className="truncate text-[10px] font-extrabold leading-tight">{field.label}</span>
                      <span className="truncate text-[8px] font-bold opacity-80">{signerName}</span>
                    </span>
                  </button>
                );
              })}
            </>
          );
        }}
      />
    </div>
  );
}
