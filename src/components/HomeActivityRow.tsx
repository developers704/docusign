"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { HomeActivityItem } from "@/components/HomeDashboard";
import { formatRecipientSentAt } from "@/lib/agreementProgress";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function HomeActivityRow({ item, canCreate }: { item: HomeActivityItem; canCreate: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"remind" | "correct" | null>(null);
  const [message, setMessage] = useState("");
  const [showDetails, setShowDetails] = useState(false);

  const waiting = (item.recipients || []).filter((recipient) => recipient.state === "waiting");
  const signed = (item.recipients || []).filter((recipient) => recipient.state === "signed");
  const pending = (item.recipients || []).filter((recipient) => recipient.state === "pending");

  async function resend() {
    setBusy("remind");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/envelopes/${item.id}/remind`, { method: "POST" });
      const result = (await response.json()) as { error?: string; message?: string };
      setMessage(response.ok ? result.message || "Reminder sent." : result.error || "Could not resend.");
      if (response.ok) router.refresh();
    } catch {
      setMessage("Connection error.");
    } finally {
      setBusy(null);
    }
  }

  async function correct() {
    if (
      !window.confirm(
        "Correct this envelope? You can fix emails, names, and fields, then send again. Old signing links stop working."
      )
    ) {
      return;
    }
    setBusy("correct");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/envelopes/${item.id}/correct`, { method: "POST" });
      const result = (await response.json()) as { error?: string; envelopeId?: string };
      if (!response.ok) {
        setMessage(result.error || "Could not correct.");
        return;
      }
      const envelopeId = result.envelopeId || item.id;
      sessionStorage.setItem(
        "esign_notice",
        "Correction started. Fix recipient emails or names if needed, then continue to Prepare and send again."
      );
      // Recipients first (emails/names), then Prepare for fields — same as new-envelope flow.
      router.push(`/documents/new?draft=${envelopeId}`);
      router.refresh();
    } catch {
      setMessage("Connection error.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0 flex-1">
        <Link
          href={`/envelopes/${item.id}`}
          className="text-[15px] font-semibold text-[#212121] hover:text-[#4c00ff] hover:underline sm:text-[16px]"
        >
          {item.title}
        </Link>
        <p className="mt-1 text-[13px] text-[#666]">{timeAgo(item.updatedAt)}</p>
      </div>

      <div className="flex min-w-0 flex-1 items-center sm:justify-center">
        {item.status === "completed" ? (
          <div className="w-full max-w-[280px]">
            <p className="inline-flex items-center gap-2 text-[14px] font-semibold text-[#087a4a]">Completed</p>
            <div className="mt-2 h-1.5 rounded-full bg-[#e8e8ee]">
              <div className="h-1.5 rounded-full bg-[#087a4a]" style={{ width: "100%" }} />
            </div>
            {signed.length > 0 && (
              <p className="mt-2 text-[12px] text-[#666]">
                Signed by {signed.map((recipient) => recipient.name).join(", ")}
              </p>
            )}
          </div>
        ) : item.isDraft ? (
          <p className="text-[13px] font-semibold capitalize text-[#666]">Draft</p>
        ) : (
          <div
            className="relative w-full max-w-[280px]"
            onMouseEnter={() => setShowDetails(true)}
            onMouseLeave={() => setShowDetails(false)}
          >
            <p className="cursor-default text-[13px] font-semibold text-[#212121] underline decoration-dotted underline-offset-2">
              {item.summaryLabel || item.stageLabel}
            </p>
            <div className="mt-2 h-1.5 rounded-full bg-[#e8e8ee]">
              <div
                className="h-1.5 rounded-full bg-[#4c00ff] transition-[width] duration-300"
                style={{ width: `${item.progressPercent ?? 0}%` }}
              />
            </div>

            {showDetails && (item.recipients || []).length > 0 && (
              <div className="absolute left-0 top-full z-30 mt-2 w-[min(100vw-2rem,320px)] rounded border border-[#d8d8d8] bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,.16)]">
                {waiting.length > 0 && (
                  <div>
                    <p className="text-[14px] font-semibold text-[#212121]">Waiting for</p>
                    <ul className="mt-2 space-y-2 text-[13px] text-[#333]">
                      {waiting.map((recipient) => (
                        <li key={recipient.id}>
                          <span className="font-semibold">{recipient.name}</span>
                          {formatRecipientSentAt(recipient.sentAt) ? (
                            <span className="mt-0.5 block text-[12px] text-[#666]">
                              Sent on {formatRecipientSentAt(recipient.sentAt)}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {signed.length > 0 && (
                  <div className={waiting.length > 0 ? "mt-3 border-t border-[#eee] pt-3" : ""}>
                    <p className="text-[13px] font-semibold text-[#087a4a]">Signed</p>
                    <ul className="mt-1 space-y-1 text-[13px] text-[#333]">
                      {signed.map((recipient) => (
                        <li key={recipient.id}>{recipient.name}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {pending.length > 0 && (
                  <div className={waiting.length > 0 || signed.length > 0 ? "mt-3 border-t border-[#eee] pt-3" : ""}>
                    <p className="text-[13px] font-semibold text-[#666]">Not sent yet</p>
                    <ul className="mt-1 space-y-1 text-[13px] text-[#666]">
                      {pending.map((recipient) => (
                        <li key={recipient.id}>{recipient.name}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        {item.canDownload ? (
          <a
            href={`/api/admin/envelopes/${item.id}/download?type=signed`}
            className="inline-flex h-9 items-center rounded-[2px] border border-[#c6c6c6] bg-white px-4 text-[13px] font-semibold text-[#212121] hover:bg-[#f5f5f5]"
          >
            Download
          </a>
        ) : item.isDraft ? (
          <Link
            href={`/prepare/${item.id}`}
            className="inline-flex h-9 items-center rounded-[2px] border border-[#c6c6c6] bg-white px-4 text-[13px] font-semibold text-[#212121] hover:bg-[#f5f5f5]"
          >
            Continue
          </Link>
        ) : canCreate ? (
          <>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void resend()}
              className="inline-flex h-9 items-center rounded-[2px] border border-[#c6c6c6] bg-white px-4 text-[13px] font-semibold text-[#212121] hover:bg-[#f5f5f5] disabled:opacity-50"
            >
              {busy === "remind" ? "Sending…" : "Resend"}
            </button>
            {item.canCorrect ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void correct()}
                className="inline-flex h-9 items-center rounded-[2px] border border-[#c6c6c6] bg-white px-4 text-[13px] font-semibold text-[#212121] hover:bg-[#f5f5f5] disabled:opacity-50"
              >
                {busy === "correct" ? "Opening…" : "Correct"}
              </button>
            ) : null}
          </>
        ) : (
          <Link
            href={`/envelopes/${item.id}`}
            className="inline-flex h-9 items-center rounded-[2px] border border-[#c6c6c6] bg-white px-4 text-[13px] font-semibold text-[#212121] hover:bg-[#f5f5f5]"
          >
            View
          </Link>
        )}
      </div>

      {message ? <p className="w-full text-[12px] font-semibold text-[#666] sm:col-span-3">{message}</p> : null}
    </div>
  );
}
