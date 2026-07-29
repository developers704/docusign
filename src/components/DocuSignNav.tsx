"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { AdminNavSection, SideNavGroup } from "@/lib/adminNavigation";
import { filterSideNav, isSideNavActive } from "@/lib/adminNavigation";
import type { UserRole } from "@/lib/types";
import { Icon } from "./Icons";
import StartMenuButton from "./StartMenuButton";

function sideLinkActive(pathname: string, searchParams: URLSearchParams, href: string) {
  const [path, query] = href.split("?");
  if (query) {
    const expected = new URLSearchParams(query);
    const view = expected.get("view");
    if (path === "/agreements") {
      if (pathname === "/agreements") {
        return (searchParams.get("view") || "") === (view || "");
      }
      if (!view && pathname.startsWith("/envelopes")) return true;
      return false;
    }
    if (path === "/templates" && pathname.startsWith("/templates")) {
      if (view === "global") return searchParams.get("view") === "global" && !searchParams.get("folder");
      if (view === "favorites") return searchParams.get("view") === "favorites" && !searchParams.get("folder");
      if (expected.get("create") === "1") return searchParams.get("create") === "1";
      const folder = expected.get("folder");
      if (folder) return searchParams.get("folder") === folder;
      return false;
    }
    if (path === "/powerforms" || path === "/webforms") {
      const onPower = pathname === "/powerforms" || pathname.startsWith("/powerforms/");
      const onWeb = pathname === "/webforms" || pathname.startsWith("/webforms/");
      if (path === "/powerforms" && !onPower) return false;
      if (path === "/webforms" && !onWeb) return false;
      const office = expected.get("office");
      if (office) return searchParams.get("office") === office;
      return !searchParams.get("office");
    }
    if (path === "/reports" && pathname === "/reports") {
      return (searchParams.get("view") || "") === (view || "");
    }
    return false;
  }
  if (path === "/templates" && pathname.startsWith("/templates")) {
    return (
      !searchParams.get("view") &&
      !searchParams.get("folder") &&
      searchParams.get("create") !== "1" &&
      !pathname.includes("/edit")
    );
  }
  if (path === "/powerforms") return pathname === "/powerforms" && !searchParams.get("office");
  if (path === "/webforms") return pathname === "/webforms" && !searchParams.get("office");
  return isSideNavActive(pathname, href);
}

export function DocuSignSideNav({
  section,
  groups,
  role,
  canCreate,
  onNavigate,
  mobile = false,
}: {
  section: AdminNavSection;
  groups: SideNavGroup[];
  role: UserRole;
  canCreate: boolean;
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filtered = filterSideNav(groups, role);

  return (
    <aside
      className={`flex shrink-0 flex-col bg-[#f6f3f9] ${
        mobile ? "h-full w-full border-0" : "w-[260px] border-r border-[#e7e2ec]"
      }`}
    >
      <div className="border-b border-[#e7e2ec] p-4">
        {canCreate ? (
          <StartMenuButton onNavigate={onNavigate} />
        ) : (
          <div className="rounded-[2px] border border-[#e7e2ec] bg-white px-4 py-3 text-[15px] font-semibold text-[#6b6578]">
            Viewer access
          </div>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-4 scrollbar-thin">
        {filtered.map((group, groupIndex) => (
          <div key={`${section}-${groupIndex}`} className={groupIndex > 0 ? "mt-6" : ""}>
            {group.title && (
              <p className="px-3 pb-2 text-[12px] font-bold uppercase tracking-[.08em] text-[#6b6578]">{group.title}</p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = sideLinkActive(pathname, searchParams, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => onNavigate?.()}
                      className={`relative flex min-h-11 items-center gap-3 rounded-[2px] px-3 py-2.5 text-[15px] font-semibold transition ${
                        active ? "bg-[#f0ebff] text-[#21004c]" : "text-[#3d3848] hover:bg-[#f6f3f9]"
                      }`}
                    >
                      {active && <span className="absolute bottom-1 left-0 top-1 w-[3px] rounded-r bg-[#4c00ff]" />}
                      <Icon name={item.icon} className={`h-5 w-5 ${active ? "text-[#4c00ff]" : "text-[#5c5668]"}`} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
