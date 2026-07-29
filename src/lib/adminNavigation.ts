import type { IconName } from "@/components/Icons";
import type { TemplateFolderRecord, UserRole } from "@/lib/types";

export type AdminNavSection = "home" | "agreements" | "templates" | "reports" | "admin";

export type SideNavItem = {
  href: string;
  label: string;
  icon: IconName;
  superOnly?: boolean;
  hideFor?: UserRole[];
};

export type SideNavGroup = {
  title?: string;
  items: SideNavItem[];
};

export const topNavItems: Array<{ section: AdminNavSection; label: string; href: string }> = [
  { section: "home", label: "Home", href: "/" },
  { section: "agreements", label: "Agreements", href: "/agreements" },
  { section: "templates", label: "Templates", href: "/templates" },
  { section: "reports", label: "Reports", href: "/reports" },
  { section: "admin", label: "Admin", href: "/offices" },
];

export const sectionSideNav: Record<AdminNavSection, SideNavGroup[]> = {
  home: [
    {
      items: [
        { href: "/", label: "Overview", icon: "home" },
        { href: "/agreements", label: "Agreement activity", icon: "agreement" },
        { href: "/documents/new", label: "Start agreement", icon: "send", hideFor: ["viewer"] },
      ],
    },
  ],
  agreements: [
    {
      title: "Envelopes",
      items: [
        { href: "/agreements", label: "All agreements", icon: "agreement" },
        { href: "/agreements?view=waiting", label: "Waiting for others", icon: "clock" },
        { href: "/agreements?view=scheduled", label: "Scheduled", icon: "calendar" },
        { href: "/agreements?view=sent", label: "Sent", icon: "send" },
        { href: "/agreements?view=completed", label: "Completed", icon: "check" },
        { href: "/agreements?view=draft", label: "Drafts", icon: "file" },
        { href: "/agreements?view=action", label: "Action required", icon: "team" },
      ],
    },
    {
      title: "Workflows",
      items: [{ href: "/workflows", label: "Signing workflows", icon: "workflow", hideFor: ["viewer"] }],
    },
  ],
  templates: [
    {
      title: "Envelope Templates",
      items: [
        { href: "/templates", label: "My Templates", icon: "template" },
        { href: "/templates?view=global", label: "Shared with Me", icon: "team" },
        { href: "/templates?view=favorites", label: "Favorites", icon: "star" },
      ],
    },
    {
      title: "Web Forms",
      items: [
        { href: "/webforms", label: "My Web Forms", icon: "file" },
        { href: "/powerforms", label: "PowerForms", icon: "send" },
      ],
    },
    {
      title: "Create",
      items: [
        { href: "/templates?create=1", label: "Create a Template", icon: "plus", hideFor: ["viewer"] },
        { href: "/powerforms/new", label: "Create Web Form", icon: "send", hideFor: ["viewer"] },
      ],
    },
  ],
  reports: [
    {
      title: "Dashboards",
      items: [
        { href: "/reports", label: "Administrator dashboard", icon: "report" },
        { href: "/reports?view=audit", label: "Audit events", icon: "shield" },
      ],
    },
    {
      title: "Report type",
      items: [
        { href: "/reports?view=envelopes", label: "Envelope usage", icon: "agreement" },
        { href: "/reports?view=recipients", label: "Recipient activity", icon: "contact" },
      ],
    },
  ],
  admin: [
    {
      title: "Organization",
      items: [
        { href: "/offices", label: "Office workspaces", icon: "office", superOnly: true },
        { href: "/team", label: "Team & roles", icon: "team" },
        { href: "/contacts", label: "Contacts", icon: "contact" },
      ],
    },
    {
      title: "Platform",
      items: [
        { href: "/integrations", label: "Integrations", icon: "integration" },
        { href: "/settings", label: "Settings", icon: "settings" },
      ],
    },
  ],
};

export function resolveAdminSection(pathname: string): AdminNavSection {
  if (pathname === "/" || pathname.startsWith("/login")) return "home";
  if (
    pathname.startsWith("/agreements") ||
    pathname.startsWith("/envelopes") ||
    pathname.startsWith("/documents") ||
    pathname.startsWith("/prepare") ||
    pathname.startsWith("/workflows")
  ) {
    return "agreements";
  }
  if (pathname.startsWith("/templates") || pathname.startsWith("/powerforms") || pathname.startsWith("/webforms")) {
    return "templates";
  }
  if (pathname.startsWith("/reports")) return "reports";
  return "admin";
}

export function filterSideNav(groups: SideNavGroup[], role: UserRole) {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.superOnly && role !== "super_admin") return false;
        if (item.hideFor?.includes(role)) return false;
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);
}

/** Append office workspaces under the Templates → Web Forms side nav. */
export function withOfficeWorkspaces(
  groups: SideNavGroup[],
  offices: Array<{ id: string; name: string }>,
  pathname = "/powerforms"
): SideNavGroup[] {
  if (!offices.length) return groups;
  const sorted = [...offices].sort((a, b) => a.name.localeCompare(b.name));
  const base = pathname.startsWith("/webforms") ? "/webforms" : "/powerforms";
  const workspaceGroup: SideNavGroup = {
    title: "Workspaces",
    items: sorted.map((office) => ({
      href: `${base}?office=${encodeURIComponent(office.id)}`,
      label: office.name,
      icon: "office" as IconName,
    })),
  };
  const next = [...groups];
  const webFormsIndex = next.findIndex((group) => group.title === "Web Forms");
  const insertAt = webFormsIndex >= 0 ? webFormsIndex + 1 : Math.min(2, next.length);
  next.splice(insertAt, 0, workspaceGroup);
  return next;
}

/** Append user-created template folders under the Templates side nav. */
export function withTemplateFolders(groups: SideNavGroup[], folders: TemplateFolderRecord[]): SideNavGroup[] {
  if (!folders.length) return groups;

  const myFolders = folders
    .filter((folder) => folder.kind === "my")
    .sort((a, b) => a.name.localeCompare(b.name));
  const sharedFolders = folders
    .filter((folder) => folder.kind === "shared")
    .sort((a, b) => a.name.localeCompare(b.name));

  const extra: SideNavGroup[] = [];
  if (myFolders.length) {
    extra.push({
      title: "Folders",
      items: myFolders.map((folder) => ({
        href: `/templates?folder=${encodeURIComponent(folder.id)}`,
        label: folder.name,
        icon: "folder" as IconName,
      })),
    });
  }
  if (sharedFolders.length) {
    extra.push({
      title: "Shared Folders",
      items: sharedFolders.map((folder) => ({
        href: `/templates?folder=${encodeURIComponent(folder.id)}`,
        label: folder.name,
        icon: "folder" as IconName,
      })),
    });
  }
  if (!extra.length) return groups;

  // Insert folder groups after Envelope Templates (index 0), before Web Forms.
  const next = [...groups];
  next.splice(1, 0, ...extra);
  return next;
}

export function isSideNavActive(pathname: string, href: string) {
  const [path, query] = href.split("?");
  if (query) {
    return false;
  }
  if (path === "/") return pathname === "/";
  if (path === "/agreements" && href === "/agreements") {
    return pathname === "/agreements" || pathname.startsWith("/envelopes");
  }
  return pathname === path || pathname.startsWith(`${path}/`);
}
