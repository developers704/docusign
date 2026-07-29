"use client";

import { EnvelopePdfViewer } from "@/components/PdfPageCanvas";

export default function DocumentPreviewModal({
  title = "Document Preview",
  fileName,
  src,
  onClose,
}: {
  title?: string;
  fileName: string;
  src: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[90] flex items-stretch justify-center bg-[#2a0a3d]/55 p-0 sm:items-center sm:p-6 md:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="flex h-[100dvh] w-full max-w-none flex-col overflow-hidden rounded-none bg-white shadow-none sm:h-[min(860px,92vh)] sm:max-w-[820px] sm:rounded-[4px] sm:shadow-[0_12px_40px_rgba(0,0,0,.35)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#e8e8e8] px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5 sm:pt-3.5">
          <h2 className="text-[17px] font-semibold text-[#000] sm:text-[18px]">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded text-[#666] hover:bg-[#f2f2f2] sm:h-8 sm:w-8"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#f3f3f3] px-2 py-3 sm:px-8 sm:py-6">
          <EnvelopePdfViewer src={src} title={fileName} />
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[#e8e8e8] bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
          <p className="min-w-0 truncate text-[13px] text-[#666]" title={fileName}>
            {fileName}
          </p>
          <a href={src} target="_blank" rel="noreferrer" className="shrink-0 text-[13px] font-semibold text-[#4c00ff] hover:underline">
            Open in new tab
          </a>
        </div>
      </div>
    </div>
  );
}
