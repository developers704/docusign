"use client";

import DocuSignModal from "@/components/templates/DocuSignModal";
import { Icon } from "@/components/Icons";

export type SigningOrderRecipient = {
  id: string;
  role: string;
  name: string;
  email: string;
  action: string;
};

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

export default function SigningOrderDiagramModal({
  recipients,
  senderLabel,
  onClose,
}: {
  recipients: SigningOrderRecipient[];
  senderLabel: string;
  onClose: () => void;
}) {
  const senderInitials = initials(senderLabel || "Me");

  return (
    <DocuSignModal
      title="Signing Order Diagram"
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-[2px] border border-[#212121] bg-white px-4 text-[13px] font-semibold text-[#000] hover:bg-[#f5f5f5]"
        >
          Close
        </button>
      }
    >
      <div className="relative mx-auto max-w-[420px] py-2">
        {/* vertical connector */}
        <div className="absolute bottom-8 left-1/2 top-8 w-px -translate-x-1/2 bg-[#cfcfcf]" />

        {/* SENDER */}
        <div className="relative grid grid-cols-[88px_1fr] items-center gap-3 border-b border-dashed border-[#d8d8d8] py-6">
          <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#888]">Sender</p>
          <div className="flex justify-center">
            <span className="relative z-[1] flex h-10 w-10 items-center justify-center rounded-full bg-[#e8d9ff] text-[12px] font-bold text-[#4c00ff]">
              {senderInitials}
            </span>
          </div>
        </div>

        {/* STEPS */}
        {recipients.map((recipient, index) => {
          const label = recipient.name.trim() || recipient.role.trim() || `Recipient ${index + 1}`;
          return (
            <div
              key={recipient.id}
              className="relative grid grid-cols-[88px_1fr] items-center gap-3 border-b border-dashed border-[#d8d8d8] py-6"
            >
              <p className="text-[18px] font-semibold text-[#666]">{index + 1}</p>
              <div className="relative z-[1] flex items-center justify-center gap-0">
                <span
                  title={label}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[#cfe9f7] text-[12px] font-bold text-[#0b5f8a]"
                >
                  {initials(label)}
                </span>
                <span className="h-px w-5 bg-[#9ec9de]" />
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#cfe9f7] text-[#0b5f8a]">
                  <Icon name="file" className="h-4 w-4" />
                </span>
              </div>
            </div>
          );
        })}

        {/* COMPLETED */}
        <div className="relative grid grid-cols-[88px_1fr] items-center gap-3 py-6">
          <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#888]">Completed</p>
          <div className="flex justify-center">
            <span className="relative z-[1] flex h-10 w-10 items-center justify-center rounded-full bg-[#e8d9ff] text-[#4c00ff]">
              <Icon name="check" className="h-5 w-5" />
            </span>
          </div>
        </div>
      </div>
    </DocuSignModal>
  );
}
