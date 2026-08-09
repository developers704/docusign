"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import HomeActivityRow from "@/components/HomeActivityRow";
import CreateSignatureModal, { readSavedSignature, type SavedSignature } from "@/components/CreateSignatureModal";
import { Icon } from "@/components/Icons";
import type { AgreementRecipientActivity } from "@/lib/agreementProgress";

export type HomeActivityItem = {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
  waitingForName?: string | null;
  stageLabel?: string;
  summaryLabel?: string;
  progressPercent?: number;
  waitingCount?: number;
  recipients?: AgreementRecipientActivity[];
  canCorrect?: boolean;
  canDownload: boolean;
  isDraft: boolean;
};

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "VA"
  );
}

function firstInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "V";
}

/** Same typography as the "Welcome back" label directly above this block. */
const WELCOME_NAME_CLASS = {
  mobile: "min-w-0 text-[28px] font-normal uppercase tracking-[.04em] text-white",
  desktop: "min-w-0 truncate text-[12px] font-semibold uppercase tracking-[.12em] text-white/70",
} as const;

/** DocuSign-style: avatar + name in Welcome-back font; Edit only while hovering */
function WelcomeProfileBlock({
  userName,
  savedSignature,
  onEditSignature,
  layout,
}: {
  userName: string;
  savedSignature: SavedSignature | null;
  onEditSignature: () => void;
  layout: "mobile" | "desktop";
}) {
  const hasSignature = Boolean(savedSignature?.signatureDataUrl);
  const avatarSize = layout === "mobile" ? "h-14 w-14 text-[22px]" : "h-10 w-10 text-sm";
  const avatarBg = layout === "mobile" ? "bg-[#9fd4e0]" : "bg-white/15";
  const displayName = savedSignature?.fullName?.trim() || userName;

  return (
    <div className={`group/profile relative inline-flex flex-col items-start ${layout === "mobile" ? "mt-6" : "mt-3"}`}>
      <div className="inline-flex max-w-full items-center gap-2.5 sm:gap-3">
        <span
          className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${avatarSize} ${avatarBg}`}
        >
          {layout === "mobile" ? firstInitial(displayName) : initials(displayName)}
        </span>

        <button
          type="button"
          onClick={onEditSignature}
          className={`bg-transparent p-0 text-left ${WELCOME_NAME_CLASS[layout]}`}
          aria-label={hasSignature ? "Edit signature" : "Create signature"}
        >
          {displayName}
        </button>
      </div>

      {hasSignature ? (
        <button
          type="button"
          onClick={onEditSignature}
          className={`mt-2 inline-flex h-8 items-center rounded-[2px] border border-white/80 px-3 text-[12px] font-semibold text-white transition hover:bg-white/10 ${
            layout === "mobile"
              ? "opacity-100"
              : "pointer-events-none opacity-0 group-hover/profile:pointer-events-auto group-hover/profile:opacity-100"
          }`}
        >
          Edit signature
        </button>
      ) : (
        <button
          type="button"
          onClick={onEditSignature}
          className="mt-3 inline-flex h-9 items-center rounded-[2px] border border-white/80 px-3 text-[13px] font-semibold text-white hover:bg-white/10"
        >
          Create signature
        </button>
      )}
    </div>
  );
}

export default function HomeDashboard({
  userName,
  userEmail,
  canCreate,
  stats,
  activity,
}: {
  userName: string;
  userEmail: string;
  canCreate: boolean;
  stats: {
    actionRequired: number;
    waitingForOthers: number;
    expiringSoon: number;
    completed: number;
  };
  activity: HomeActivityItem[];
}) {
  const [showSignature, setShowSignature] = useState(false);
  const [savedSignature, setSavedSignature] = useState<SavedSignature | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const startRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSavedSignature(readSavedSignature(userEmail));
  }, [userEmail]);

  useEffect(() => {
    if (!startOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!startRef.current?.contains(event.target as Node)) setStartOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [startOpen]);

  function openStartMenu() {
    setStartOpen(true);
  }
  function closeStartMenu() {
    setStartOpen(false);
  }

  const mobileStats = [
    { label: "Action Required", value: stats.actionRequired, href: "/agreements?view=action" },
    { label: "Waiting for Others", value: stats.waitingForOthers, href: "/agreements?view=waiting" },
    { label: "Expiring Soon", value: stats.expiringSoon, href: "/agreements?view=expiring" },
    { label: "Completed", value: stats.completed, href: "/agreements?view=completed" },
  ];

  const desktopStats = [
    { label: "Action Required", value: stats.actionRequired, href: "/agreements?view=action" },
    { label: "Waiting for Others", value: stats.waitingForOthers, href: "/agreements?view=waiting" },
    { label: "Expiring Soon", value: stats.expiringSoon, href: "/agreements?view=expiring" },
    { label: "Completed", value: stats.completed, href: "/agreements?view=completed" },
  ];

  return (
    <div className="min-h-full bg-white text-[#212121]">
      {/* ===== MOBILE HOME (DocuSign) ===== */}
      <section className="bg-[#2d004d] px-5 pb-10 pt-8 text-white lg:hidden">
        <h1 className="text-[28px] font-normal uppercase tracking-[.04em]">Welcome back</h1>

        <WelcomeProfileBlock
          userName={userName}
          savedSignature={savedSignature}
          onEditSignature={() => setShowSignature(true)}
          layout="mobile"
        />

        <p className="mt-8 text-[16px] font-normal text-white">Last 6 Months</p>

        <div className="mt-2">
          {mobileStats.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="flex min-h-[52px] items-center justify-between border-b border-white/20 text-white"
            >
              <span className="text-[16px]">{item.label}</span>
              <span className="inline-flex items-center gap-3">
                <span className="text-[16px] tabular-nums">{item.value}</span>
                <Icon name="chevron" className="h-4 w-4 opacity-90" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ===== DESKTOP WELCOME ===== */}
      <section className="hidden bg-[#2b0a4a] px-8 py-8 text-white lg:block lg:px-12">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold uppercase tracking-[.12em] text-white/70">Welcome back</p>
            <WelcomeProfileBlock
              userName={userName}
              savedSignature={savedSignature}
              onEditSignature={() => setShowSignature(true)}
              layout="desktop"
            />
          </div>

          <div className="min-w-0 lg:max-w-[58%]">
            <p className="text-[15px] font-semibold text-white/90">Last 6 Months</p>
            <div className="mt-4 grid grid-cols-2 gap-6 sm:grid-cols-4 sm:gap-8">
              {desktopStats.map((item) => (
                <Link key={item.label} href={item.href} className="group rounded-lg p-1 transition hover:bg-white/10">
                  <p className="text-[40px] font-light leading-none group-hover:underline">{item.value}</p>
                  <p className="mt-2 text-[13px] leading-snug text-white/75">{item.label}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[980px] px-4 py-8 sm:px-8 sm:py-10">
        <div className="rounded-lg bg-[#f6f3f9] px-4 py-8 text-center sm:px-8 sm:py-10">
          <p className="text-[18px] text-[#212121] sm:text-[20px]">Sign or get signatures</p>
          {canCreate ? (
            <div
              className="relative mx-auto mt-5 inline-block"
              ref={startRef}
              onMouseEnter={openStartMenu}
              onMouseLeave={closeStartMenu}
            >
              <button
                type="button"
                aria-expanded={startOpen}
                aria-haspopup="menu"
                onClick={() => setStartOpen((open) => !open)}
                className="inline-flex h-12 items-center gap-2 rounded-[2px] bg-[#2b0a4a] px-8 text-[15px] font-bold text-white hover:bg-[#3a1060]"
              >
                Start
                <Icon name="chevron" className={`h-4 w-4 transition ${startOpen ? "-rotate-90" : "rotate-90"}`} />
              </button>
              {startOpen && (
                <div
                  role="menu"
                  className="absolute left-1/2 z-20 mt-0 w-[260px] -translate-x-1/2 overflow-hidden rounded border border-[#d8d8d8] bg-white py-1 text-left shadow-[0_8px_24px_rgba(0,0,0,.16)]"
                >
                  <Link
                    href="/documents/new"
                    role="menuitem"
                    onClick={closeStartMenu}
                    className="flex items-center gap-3 px-4 py-2.5 text-[14px] font-semibold text-[#212121] hover:bg-[#f2f2f2]"
                  >
                    <Icon name="send" className="h-4 w-4 text-[#4c00ff]" />
                    Send an Envelope
                  </Link>
                  <Link
                    href="/templates"
                    role="menuitem"
                    onClick={closeStartMenu}
                    className="flex items-center gap-3 px-4 py-2.5 text-[14px] font-semibold text-[#212121] hover:bg-[#f2f2f2]"
                  >
                    <Icon name="template" className="h-4 w-4 text-[#4c00ff]" />
                    Use a Template
                  </Link>
                  <Link
                    href="/templates?create=1"
                    role="menuitem"
                    onClick={closeStartMenu}
                    className="flex items-center gap-3 px-4 py-2.5 text-[14px] font-semibold text-[#212121] hover:bg-[#f2f2f2]"
                  >
                    <Icon name="plus" className="h-4 w-4 text-[#4c00ff]" />
                    Create a Template
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-4 text-sm text-[#666]">Your role can view contracts but cannot send new ones.</p>
          )}
        </div>

        <section className="mt-10 sm:mt-12">
          <div className="flex items-center gap-2">
            <h2 className="text-[20px] font-normal text-[#212121] sm:text-[22px]">Contract activity</h2>
            <Icon name="help" className="h-4 w-4 text-[#666]" />
          </div>

          <div className="mt-4 divide-y divide-[#e6e6ec] border-t border-[#e6e6ec]">
            {activity.length === 0 ? (
              <p className="py-12 text-center text-[14px] text-[#666]">
                No contract activity yet. Start your first envelope to see updates here.
              </p>
            ) : (
              activity.map((item) => <HomeActivityRow key={item.id} item={item} canCreate={canCreate} />)
            )}
          </div>
        </section>
      </div>

      {showSignature && (
        <CreateSignatureModal
          defaultName={userName}
          userEmail={userEmail}
          onClose={() => setShowSignature(false)}
          onSaved={setSavedSignature}
        />
      )}
    </div>
  );
}
