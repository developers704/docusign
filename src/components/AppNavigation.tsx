"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icons";
import type { UserRole } from "@/lib/types";

const primary: Array<{ href: string; label: string; icon: IconName; hideFor?: UserRole[] }> = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/agreements", label: "Contracts", icon: "agreement" },
  { href: "/templates", label: "Templates", icon: "template" },
  { href: "/workflows", label: "Workflows", icon: "workflow", hideFor: ["viewer"] },
];

const manage: Array<{ href: string; label: string; icon: IconName; superOnly?: boolean }> = [
  { href: "/offices", label: "Office workspaces", icon: "office", superOnly: true },
  { href: "/team", label: "Team & roles", icon: "team" },
  { href: "/contacts", label: "Contacts", icon: "contact" },
  { href: "/reports", label: "Reports", icon: "report" },
  { href: "/integrations", label: "Integrations", icon: "integration" },
];

function Item({ href, label, icon }: { href: string; label: string; icon: IconName }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={`group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${active ? "bg-[#efe9ff] text-[#4c00ff]" : "text-[#665d72] hover:bg-[#f5f2f8] hover:text-[#26163d]"}`}
    >
      <Icon name={icon} className={`h-[19px] w-[19px] ${active ? "text-[#4c00ff]" : "text-[#82778f] group-hover:text-[#4c00ff]"}`} />
      <span>{label}</span>
      {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#4c00ff]" />}
    </Link>
  );
}

export default function AppNavigation({ role }: { role: UserRole }) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 pb-5 scrollbar-thin">
      <p className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[.16em] text-[#aaa1b5]">Workspace</p>
      <div className="space-y-1">
        {primary.filter((item) => !item.hideFor?.includes(role)).map((item) => <Item key={item.href} {...item} />)}
      </div>
      <p className="mt-7 px-3 pb-2 text-[10px] font-bold uppercase tracking-[.16em] text-[#aaa1b5]">Manage</p>
      <div className="space-y-1">
        {manage.filter((item) => !item.superOnly || role === "super_admin").map((item) => <Item key={item.href} {...item} />)}
      </div>
      <div className="mt-7 border-t border-[#eee9f1] pt-4">
        <Item href="/settings" label="Settings" icon="settings" />
      </div>
    </nav>
  );
}
