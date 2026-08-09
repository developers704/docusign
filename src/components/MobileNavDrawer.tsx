"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { topNavItems } from "@/lib/adminNavigation";
import { Icon } from "@/components/Icons";
import LogoutButton from "@/components/LogoutButton";

export default function MobileNavDrawer({
  section,
  userName,
  onClose,
}: {
  section: string;
  userName: string;
  onClose: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
      <button type="button" aria-label="Close menu overlay" className="absolute inset-0 bg-[#2b0a4a]/50" onClick={onClose} />

      <div className="absolute bottom-0 left-0 top-0 flex w-[min(300px,82vw)] flex-col bg-white shadow-[4px_0_28px_rgba(0,0,0,.22)] pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center gap-3 border-b border-[#e8e8e8] px-3">
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#333] hover:bg-[#f2f2f2]"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
          <Link href="/" onClick={onClose} className="flex items-center gap-2" aria-label="Valliani Documents home">
            <span className="flex h-7 w-7 items-center justify-center rounded-xl brand-gradient text-[9px] font-black text-white">
              VD
            </span>
            <span className="text-[16px] font-extrabold tracking-[-.035em] text-[#21004c]">
              Valliani Documents
            </span>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          <p className="px-5 pb-1 pt-3 text-[12px] font-semibold uppercase tracking-[.06em] text-[#888]">eSignature</p>
          <ul>
            {topNavItems.map((item) => {
              const active = item.section === section || (item.href === "/" && pathname === "/");
              return (
                <li key={item.section}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className={`relative flex min-h-12 items-center px-5 text-[16px] font-medium ${
                      active ? "bg-[#f0ebff] font-semibold text-[#21004c]" : "text-[#212121]"
                    }`}
                  >
                    {active && <span className="absolute bottom-2 left-0 top-2 w-[4px] rounded-r bg-[#4c00ff]" />}
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="my-2 border-t border-[#e8e8e8]" />

          <ul>
            <li>
              <Link
                href="/agreements?view=inbox"
                onClick={onClose}
                className="flex min-h-12 items-center px-5 text-[16px] font-medium text-[#212121]"
              >
                Tasks
              </Link>
            </li>
            <li>
              <Link
                href="/settings"
                onClick={onClose}
                className="flex min-h-12 items-center justify-between px-5 text-[16px] font-medium text-[#212121]"
              >
                <span className="inline-flex items-center gap-2">
                  Help
                  <span className="h-2 w-2 rounded-full bg-[#e31c3d]" aria-hidden />
                </span>
                <Icon name="chevron" className="h-4 w-4 text-[#888]" />
              </Link>
            </li>
          </ul>
        </nav>

        <div className="border-t border-[#e8e8e8] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e8e8ee] text-[#555]">
              <Icon name="team" className="h-5 w-5" />
            </span>
            <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[#212121]">{userName}</p>
          </div>
          <div className="mt-3">
            <LogoutButton fullWidth />
          </div>
        </div>
      </div>
    </div>
  );
}
