"use client";

import Link from "next/link";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { AppSession } from "@/lib/auth";
import { resolveAdminSection, sectionSideNav, topNavItems, withOfficeWorkspaces, withTemplateFolders } from "@/lib/adminNavigation";
import type { OfficeRecord, TemplateFolderRecord } from "@/lib/types";
import { DocuSignSideNav } from "./DocuSignNav";
import { Icon } from "./Icons";
import MobileNavDrawer from "./MobileNavDrawer";
import NotificationBell from "./NotificationBell";
import LogoutButton from "./LogoutButton";

function roleLabel(role: AppSession["role"]) {
  if (role === "super_admin") return "Network admin";
  if (role === "office_admin") return "Office admin";
  if (role === "office_user") return "Sender";
  return "Viewer";
}

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

function DocuSignLayoutInner({
  children,
  session,
  office,
  folders = [],
  offices = [],
  networkName,
}: {
  children: ReactNode;
  session: AppSession;
  office?: OfficeRecord;
  folders?: TemplateFolderRecord[];
  offices?: Array<{ id: string; name: string }>;
  networkName?: string;
}) {
  const pathname = usePathname();
  const section = resolveAdminSection(pathname);
  const sideGroups =
    section === "templates"
      ? withOfficeWorkspaces(withTemplateFolders(sectionSideNav[section], folders), offices, pathname)
      : sectionSideNav[section];
  const canCreate = session.role !== "viewer";
  const portalName =
    session.role === "super_admin" ? networkName || "All offices" : office?.name || "Office portal";
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isHome = section === "home";

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileNavOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileNavOpen]);

  return (
    <div className="flex min-h-screen flex-col bg-[#f6f3f9] text-[#1c1230]">
      <header className="sticky top-0 z-40 border-b border-[#e7e2ec] bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        {/* Mobile header — DocuSign: hamburger left, logo center */}
        <div className="relative flex h-14 items-center px-2 lg:hidden">
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen(true)}
            className="absolute left-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-[#1c1230] hover:bg-[#f0ebff]"
          >
            <Icon name="menu" className="h-6 w-6" />
          </button>

          <Link
            href="/"
            className="mx-auto flex items-center gap-2"
            aria-label="Valliani Contracts home"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-xl brand-gradient text-[9px] font-black text-white shadow-md shadow-violet-200/50">
              VC
            </span>
            <span className="text-[17px] font-bold tracking-[-.02em] text-[#1c1230]">
              valliani<span className="font-semibold">contracts</span>
            </span>
          </Link>

          <div className="absolute right-2">
            <NotificationBell />
          </div>
        </div>

        {/* Desktop header */}
        <div className="hidden h-16 items-center gap-4 px-5 lg:flex">
          <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Valliani Contracts home">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl brand-gradient text-[11px] font-black text-white shadow-md shadow-violet-200/50">
              VC
            </span>
            <span className="text-[20px] font-bold leading-none tracking-[-.02em] text-[#1c1230]">
              valliani<span className="font-semibold text-[#1c1230]/85">contracts</span>
            </span>
          </Link>

          <nav className="ml-3 flex items-center gap-2">
            {topNavItems.map((item) => {
              const active = item.section === section;
              return (
                <Link
                  key={item.section}
                  href={item.href}
                  className={`border-b-[3px] px-3 pb-[18px] pt-1 text-[16px] font-semibold transition ${
                    active ? "border-[#4c00ff] text-[#1c1230]" : "border-transparent text-[#6b6578] hover:text-[#1c1230]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <Link
              href="/settings"
              aria-label="Settings"
              className="flex h-10 w-10 items-center justify-center rounded-full text-[#4a4458] hover:bg-[#f0ebff]"
            >
              <Icon name="settings" className="h-5 w-5" />
            </Link>
            <button
              type="button"
              aria-label="Help"
              className="flex h-10 w-10 items-center justify-center rounded-full text-[#4a4458] hover:bg-[#f0ebff]"
            >
              <Icon name="help" className="h-5 w-5" />
            </button>
            <NotificationBell />
            <div className="text-right">
              <p className="max-w-[170px] truncate text-[14px] font-bold leading-tight">{session.name}</p>
              <p className="text-[12px] leading-tight text-[#6b6578]">{portalName}</p>
            </div>
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full brand-gradient text-[12px] font-bold text-white"
              title={roleLabel(session.role)}
            >
              {initials(session.name)}
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {!isHome && (
          <div className="hidden lg:flex">
            <Suspense fallback={<aside className="w-[260px] shrink-0 border-r border-[#e7e2ec] bg-[#f6f3f9]" />}>
              <DocuSignSideNav section={section} groups={sideGroups} role={session.role} canCreate={canCreate} />
            </Suspense>
          </div>
        )}

        {mobileNavOpen && (
          <MobileNavDrawer section={section} userName={session.name} onClose={() => setMobileNavOpen(false)} />
        )}

        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-white pb-[env(safe-area-inset-bottom)]">{children}</main>
      </div>
    </div>
  );
}

export default function DocuSignLayout({
  children,
  session,
  office,
  folders = [],
  offices = [],
  networkName,
}: {
  children: ReactNode;
  session: AppSession;
  office?: OfficeRecord;
  folders?: TemplateFolderRecord[];
  offices?: Array<{ id: string; name: string }>;
  networkName?: string;
}) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white">{children}</div>}>
      <DocuSignLayoutInner
        session={session}
        office={office}
        folders={folders}
        offices={offices}
        networkName={networkName}
      >
        {children}
      </DocuSignLayoutInner>
    </Suspense>
  );
}
