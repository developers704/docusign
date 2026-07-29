"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icons";
import PdfPageThumbnail from "@/components/templates/PdfPageThumbnail";

function shortName(name: string) {
  if (name.length <= 20) return name;
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  const base = name.slice(0, Math.max(0, name.length - ext.length));
  return `${base.slice(0, 14)}…${ext}`;
}

export default function TemplateDocumentCard({
  fileName,
  pageCount,
  previewSrc,
  onPreview,
  onRemove,
}: {
  fileName: string;
  pageCount?: number | null;
  previewSrc?: string | null;
  onPreview: () => void;
  onRemove: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  const pagesLabel =
    pageCount == null
      ? "Ready to upload"
      : `${pageCount} ${pageCount === 1 ? "page" : "pages"}`;

  return (
    <div className="group relative flex h-[172px] w-[148px] flex-col overflow-hidden rounded-[2px] border border-[#d8d8d8] bg-white shadow-[0_1px_2px_rgba(0,0,0,.06)] transition hover:border-[#bdbdbd] hover:shadow-[0_2px_6px_rgba(0,0,0,.1)]">
      <button
        type="button"
        onClick={onPreview}
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#ececec] text-left"
        aria-label={`Preview ${fileName}`}
      >
        <div className="relative mx-auto mt-3 h-[96px] w-[78px] overflow-hidden rounded-[1px] border border-[#d0d0d0] bg-white shadow-[0_1px_3px_rgba(0,0,0,.12)]">
          {previewSrc ? (
            <PdfPageThumbnail src={previewSrc} />
          ) : (
            <div className="flex h-full items-center justify-center bg-[#f7f5ff]">
              <Icon name="file" className="h-8 w-8 text-[#4c00ff]" />
            </div>
          )}
        </div>
      </button>

      <div className="border-t border-[#ececec] px-2.5 py-2">
        <p className="truncate text-[12px] font-semibold text-[#000]" title={fileName}>
          {shortName(fileName)}
        </p>
        <p className="text-[11px] text-[#666]">{pagesLabel}</p>
      </div>

      <div ref={menuRef} className="absolute bottom-[52px] right-1.5 z-10">
        <button
          type="button"
          aria-label={`More options for ${fileName}`}
          aria-expanded={menuOpen}
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen((open) => !open);
          }}
          className="inline-flex h-7 w-7 items-center justify-center rounded text-[#555] hover:bg-[#e8e8e8]"
        >
          <Icon name="moreVertical" className="h-4 w-4" />
        </button>
        {menuOpen && (
          <div className="absolute bottom-8 right-0 min-w-[140px] overflow-hidden rounded-[2px] border border-[#d8d8d8] bg-white py-1 shadow-[0_4px_16px_rgba(0,0,0,.18)]">
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-[13px] text-[#000] hover:bg-[#f0ebff]"
              onClick={() => {
                setMenuOpen(false);
                onPreview();
              }}
            >
              Preview
            </button>
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-[13px] text-[#b00020] hover:bg-[#fff5f5]"
              onClick={() => {
                setMenuOpen(false);
                onRemove();
              }}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
