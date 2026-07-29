import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "home"
  | "agreement"
  | "template"
  | "workflow"
  | "office"
  | "team"
  | "contact"
  | "report"
  | "integration"
  | "settings"
  | "search"
  | "bell"
  | "help"
  | "plus"
  | "upload"
  | "check"
  | "clock"
  | "send"
  | "more"
  | "chevron"
  | "sparkle"
  | "shield"
  | "download"
  | "file"
  | "filter"
  | "calendar"
  | "arrow"
  | "logout"
  | "moreVertical"
  | "star"
  | "menu"
  | "close"
  | "folder";

const paths: Record<IconName, ReactNode> = {
  home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/></>,
  agreement: <><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4"/><path d="M9 12h6M9 16h6"/></>,
  template: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
  workflow: <><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><path d="M9 6h4a4 4 0 0 1 4 4v5M15 18h-4a4 4 0 0 1-4-4V9"/></>,
  office: <><path d="M4 21V7l8-4 8 4v14"/><path d="M8 21v-5h8v5M8 9h.01M12 9h.01M16 9h.01M8 12h.01M12 12h.01M16 12h.01"/></>,
  team: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  contact: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M5.5 16a4 4 0 0 1 7 0M15 9h3M15 13h3"/></>,
  report: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></>,
  integration: <><path d="M8 12h8M12 8v8"/><rect x="3" y="3" width="6" height="6" rx="2"/><rect x="15" y="3" width="6" height="6" rx="2"/><rect x="3" y="15" width="6" height="6" rx="2"/><rect x="15" y="15" width="6" height="6" rx="2"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.15.35.36.66.6 1 .28.3.66.46 1.1.5h.1v4h-.1a1.7 1.7 0 0 0-1.7.5Z"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7"/><path d="M10 19a2 2 0 0 0 4 0"/></>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.6 2.6 0 1 1 4.3 2c-1 .8-1.8 1.2-1.8 3M12 18h.01"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 17v3h16v-3"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  send: <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>,
  more: <><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  sparkle: <><path d="m12 3 1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3Z"/><path d="m19 14 .7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7Z"/></>,
  shield: <><path d="M12 3 5 6v5c0 5 3.3 8.2 7 10 3.7-1.8 7-5 7-10V6Z"/><path d="m9 12 2 2 4-4"/></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 20h16"/></>,
  file: <><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4"/></>,
  filter: <path d="M4 5h16l-6 7v6l-4 2v-8Z"/>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></>,
  arrow: <path d="M5 12h14M14 7l5 5-5 5"/>,
  logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M14 3h7v18h-7"/></>,
  moreVertical: <><circle cx="12" cy="5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="19" r="1" fill="currentColor"/></>,
  star: <path d="m12 3 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.9 7.2 18l.9-5.4L4.2 8.7l5.4-.8Z"/>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
  close: <path d="M6 6l12 12M18 6 6 18"/>,
  folder: <><path d="M3 7h6l2 2h10v10H3z"/><path d="M3 7V5h5l2 2"/></>,
};

export function Icon({ name, className = "h-5 w-5", ...props }: { name: IconName; className?: string } & SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...props}>{paths[name]}</svg>;
}
