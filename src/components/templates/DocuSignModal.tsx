"use client";

import type { ReactNode } from "react";

export default function DocuSignModal({
  title,
  children,
  footer,
  onClose,
  wide,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#2a0a3d]/55 p-4" role="dialog" aria-modal="true">
      <div className={`w-full overflow-hidden rounded-lg bg-white shadow-[0_8px_32px_rgba(0,0,0,.28)] ${wide ? "max-w-[760px]" : "max-w-[520px]"}`}>
        <div className="flex items-center justify-between border-b border-[#ececec] px-6 py-4">
          <h2 className="text-[20px] font-semibold text-[#000]">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded text-[#666] hover:bg-[#f2f2f2]"
          >
            ×
          </button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-[#ececec] px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}
