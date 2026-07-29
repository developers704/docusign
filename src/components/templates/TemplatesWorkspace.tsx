"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { OfficeRecord, TemplateFolderRecord, TemplateRecord } from "@/lib/types";
import CreateTemplateForm from "@/components/templates/CreateTemplateForm";
import TemplateRowActions from "@/components/templates/TemplateRowActions";
import { Icon } from "@/components/Icons";

type ServerAction = (formData: FormData) => Promise<void>;
type DateFilter = "any" | "7d" | "30d" | "90d" | "year";
type SortKey = "name" | "owner" | "created" | "updated";
type SortDir = "asc" | "desc";
type StatusFilter = "any" | "draft" | "published" | "archived";

const FAVORITES_KEY = "va-template-favorites";
const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

function formatDateParts(value: string) {
  const date = new Date(value);
  const day = date.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
  return { day, time };
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function matchesDateFilter(iso: string, filter: DateFilter) {
  if (filter === "any") return true;
  const value = new Date(iso).getTime();
  if (!Number.isFinite(value)) return false;
  const now = Date.now();
  if (filter === "7d") return value >= now - 7 * 24 * 60 * 60 * 1000;
  if (filter === "30d") return value >= now - 30 * 24 * 60 * 60 * 1000;
  if (filter === "90d") return value >= now - 90 * 24 * 60 * 60 * 1000;
  const yearStart = startOfDay(new Date(new Date().getFullYear(), 0, 1)).getTime();
  return value >= yearStart;
}

function dateFilterLabel(filter: DateFilter) {
  if (filter === "7d") return "Last 7 days";
  if (filter === "30d") return "Last 30 days";
  if (filter === "90d") return "Last 90 days";
  if (filter === "year") return "This year";
  return "Date";
}

export default function TemplatesWorkspace({
  templates,
  view,
  folderId = "",
  folderName = "",
  showCreate,
  canCreate,
  canManage,
  officeNames,
  offices,
  folders,
  powerFormCounts,
  defaultOfficeId,
  allowOfficeSelection,
  createAction,
  duplicateAction,
  updateStatusAction,
  useTemplateAction,
  deleteAction,
  matchingAction,
  moveAction,
  shareAction,
  createFolderAction,
  renameFolderAction,
  deleteFolderAction,
  createPowerFormAction,
  createWebFormAction,
}: {
  templates: TemplateRecord[];
  view: string;
  folderId?: string;
  folderName?: string;
  showCreate: boolean;
  canCreate: boolean;
  canManage: boolean;
  officeNames: Record<string, string>;
  offices: OfficeRecord[];
  folders: TemplateFolderRecord[];
  powerFormCounts: Record<string, number>;
  defaultOfficeId: string;
  allowOfficeSelection: boolean;
  createAction: ServerAction;
  duplicateAction: ServerAction;
  updateStatusAction: ServerAction;
  useTemplateAction: ServerAction;
  deleteAction?: ServerAction;
  matchingAction: ServerAction;
  moveAction: ServerAction;
  shareAction: ServerAction;
  createFolderAction: ServerAction;
  renameFolderAction: ServerAction;
  deleteFolderAction: ServerAction;
  createPowerFormAction: ServerAction;
  createWebFormAction: ServerAction;
}) {
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [newFolderName, setNewFolderName] = useState("");
  const [renameFolderValue, setRenameFolderValue] = useState(folderName);
  const [folderSearch, setFolderSearch] = useState("");
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("any");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("any");
  const [folderFilter, setFolderFilter] = useState("");
  const [matchingOnly, setMatchingOnly] = useState(false);
  const [hasDocsOnly, setHasDocsOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(25);
  const [dateOpen, setDateOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [pageSizeOpen, setPageSizeOpen] = useState(false);
  const [foldersOpen, setFoldersOpen] = useState(false);
  const [foldersTab, setFoldersTab] = useState(Boolean(folderId));
  const filtersRef = useRef<HTMLDivElement>(null);
  const foldersRef = useRef<HTMLDivElement>(null);

  const title = folderName
    ? folderName
    : view === "global"
      ? "Shared with Me"
      : view === "favorites"
        ? "Favorites"
        : foldersTab
          ? "Folders"
          : "My Templates";

  useEffect(() => {
    setRenameFolderValue(folderName);
  }, [folderId, folderName]);

  useEffect(() => {
    setFoldersTab(Boolean(folderId));
  }, [folderId]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FAVORITES_KEY);
      if (raw) setFavorites(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!filtersRef.current?.contains(event.target as Node)) {
        setDateOpen(false);
        setAdvancedOpen(false);
        setPageSizeOpen(false);
      }
      if (!foldersRef.current?.contains(event.target as Node)) {
        setFoldersOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [query, dateFilter, statusFilter, folderFilter, matchingOnly, hasDocsOnly, view, folderName, pageSize]);

  const filteredTemplates = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = view === "favorites" ? templates.filter((template) => favorites[template.id]) : templates;

    list = list.filter((template) => {
      if (q) {
        const haystack = [
          template.name,
          template.title,
          template.description,
          template.category,
          ...(template.tags || []),
          officeNames[template.officeId] || "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (!matchesDateFilter(template.updatedAt || template.createdAt, dateFilter)) return false;
      if (statusFilter !== "any" && template.status !== statusFilter) return false;
      if (folderFilter && !(template.folderIds || []).includes(folderFilter)) return false;
      if (matchingOnly && !template.matchingEligible) return false;
      if (hasDocsOnly && !(template.documents || []).length) return false;
      return true;
    });

    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "owner") cmp = (officeNames[a.officeId] || "").localeCompare(officeNames[b.officeId] || "");
      else if (sortKey === "created") cmp = a.createdAt.localeCompare(b.createdAt);
      else cmp = a.updatedAt.localeCompare(b.updatedAt);
      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [
    templates,
    favorites,
    view,
    query,
    dateFilter,
    statusFilter,
    folderFilter,
    matchingOnly,
    hasDocsOnly,
    sortKey,
    sortDir,
    officeNames,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredTemplates.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedTemplates = filteredTemplates.slice((safePage - 1) * pageSize, safePage * pageSize);

  const visibleFolders = useMemo(() => {
    const q = folderSearch.trim().toLowerCase();
    if (!q) return folders;
    return folders.filter((folder) => folder.name.toLowerCase().includes(q));
  }, [folders, folderSearch]);

  const filtersActive =
    Boolean(query.trim()) ||
    dateFilter !== "any" ||
    statusFilter !== "any" ||
    Boolean(folderFilter) ||
    matchingOnly ||
    hasDocsOnly;

  function toggleFavorite(id: string) {
    setFavorites((current) => {
      const next = { ...current, [id]: !current[id] };
      try {
        window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function clearFilters() {
    setQuery("");
    setDateFilter("any");
    setStatusFilter("any");
    setFolderFilter("");
    setMatchingOnly(false);
    setHasDocsOnly(false);
    setDateOpen(false);
    setAdvancedOpen(false);
    setPage(1);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" || key === "owner" ? "asc" : "desc");
    }
  }

  function SortHeader({ label, column }: { label: string; column: SortKey }) {
    const active = sortKey === column;
    return (
      <button type="button" onClick={() => toggleSort(column)} className="inline-flex items-center gap-1 hover:text-[#000]">
        {label}
        <Icon
          name="chevron"
          className={`h-3 w-3 ${active ? "opacity-100 text-[#4c00ff]" : "opacity-50"} ${
            active && sortDir === "asc" ? "-rotate-90" : "rotate-90"
          }`}
        />
      </button>
    );
  }

  function renderRowActions(template: TemplateRecord, owner: string, pfCount: number) {
    return (
      <TemplateRowActions
        template={template}
        canManage={canManage}
        ownerLabel={owner}
        folders={folders}
        powerFormCount={pfCount}
        duplicateAction={duplicateAction}
        updateStatusAction={updateStatusAction}
        useTemplateAction={useTemplateAction}
        deleteAction={deleteAction}
        matchingAction={matchingAction}
        moveAction={moveAction}
        shareAction={shareAction}
        createFolderAction={createFolderAction}
        createPowerFormAction={createPowerFormAction}
        createWebFormAction={createWebFormAction}
        downloadHref={`/api/admin/templates/${template.id}/download`}
      />
    );
  }

  const createHref = folderId
    ? `/templates?create=1&folder=${encodeURIComponent(folderId)}`
    : "/templates?create=1";

  return (
    <div className="min-h-full bg-white text-[#000]">
      {showCreate ? (
        !canCreate ? (
          <div className="px-8 py-16 text-center text-[14px] text-amber-900">
            You cannot create templates with your current access.
          </div>
        ) : (
          <CreateTemplateForm
            createAction={createAction}
            allowOfficeSelection={allowOfficeSelection}
            offices={offices}
            defaultOfficeId={defaultOfficeId}
            folderId={folderId}
          />
        )
      ) : (
        <>
          <div className="px-4 pb-2 pt-5 sm:px-8 sm:pt-7">
            <h1 className="text-[24px] font-semibold leading-none tracking-[-.01em] text-[#000] sm:text-[28px]">{title}</h1>

            <div className="mt-5 rounded-[2px] border border-[#e5e5e5] bg-[#fafafa] p-3 sm:mt-6 sm:p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="inline-flex rounded-[2px] border border-[#c6c6c6] bg-white p-0.5">
                    <Link
                      href="/templates"
                      onClick={() => {
                        setFoldersTab(false);
                        setFoldersOpen(false);
                        setFolderSearch("");
                      }}
                      className={`inline-flex h-8 items-center rounded-[2px] px-3 text-[12px] font-semibold ${
                        !foldersTab
                          ? "bg-[#4c00ff] text-white"
                          : "text-[#000] hover:bg-[#f5f5f5]"
                      }`}
                    >
                      All templates
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setFoldersTab(true);
                        setFoldersOpen(true);
                      }}
                      className={`inline-flex h-8 items-center gap-1.5 rounded-[2px] px-3 text-[12px] font-semibold ${
                        foldersTab
                          ? "bg-[#4c00ff] text-white"
                          : "text-[#000] hover:bg-[#f5f5f5]"
                      }`}
                    >
                      <Icon name="folder" className="h-3.5 w-3.5" />
                      Folders
                      <span className={foldersTab ? "text-white/80" : "text-[#999]"}>({folders.length})</span>
                    </button>
                  </div>

                  {foldersTab ? (
                    <>
                      <div ref={foldersRef} className="relative mt-3 max-w-md">
                        <p className="mb-1.5 text-[12px] font-semibold text-[#666]">Select folder</p>
                        <button
                          type="button"
                          onClick={() => setFoldersOpen((open) => !open)}
                          className={`inline-flex h-9 w-full items-center justify-between gap-2 rounded-[2px] border bg-white px-3 text-left text-[13px] font-semibold ${
                            folderId || foldersOpen
                              ? "border-[#4c00ff] text-[#4c00ff]"
                              : "border-[#c6c6c6] text-[#000]"
                          }`}
                          aria-expanded={foldersOpen}
                          aria-haspopup="listbox"
                        >
                          <span className="inline-flex min-w-0 items-center gap-2">
                            <Icon name="folder" className="h-4 w-4 shrink-0 opacity-70" />
                            <span className="truncate">{folderId ? folderName || "Folder" : "Choose a folder…"}</span>
                          </span>
                          <Icon
                            name="chevron"
                            className={`h-3.5 w-3.5 shrink-0 text-[#666] ${foldersOpen ? "-rotate-90" : "rotate-90"}`}
                          />
                        </button>

                        {foldersOpen && (
                          <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-40 overflow-hidden rounded-[2px] border border-[#d8d8d8] bg-white shadow-lg">
                            <div className="border-b border-[#ececec] p-2">
                              <div className="relative">
                                <Icon
                                  name="search"
                                  className="absolute left-2.5 top-1/2 h-[13px] w-[13px] -translate-y-1/2 text-[#666]"
                                />
                                <input
                                  value={folderSearch}
                                  onChange={(event) => setFolderSearch(event.target.value)}
                                  placeholder="Search folders"
                                  autoFocus
                                  className="h-8 w-full rounded-[2px] border border-[#c6c6c6] bg-white pl-8 pr-2 text-[12px] text-[#000] outline-none placeholder:text-[#666] focus:border-[#4c00ff]"
                                />
                              </div>
                            </div>
                            <div className="max-h-56 overflow-y-auto py-1" role="listbox">
                              {visibleFolders.map((folder) => (
                                <Link
                                  key={folder.id}
                                  href={`/templates?folder=${encodeURIComponent(folder.id)}`}
                                  role="option"
                                  aria-selected={folderId === folder.id}
                                  onClick={() => {
                                    setFoldersOpen(false);
                                    setFolderSearch("");
                                    setFoldersTab(true);
                                  }}
                                  className={`flex items-center gap-2 px-3 py-2 text-[13px] hover:bg-[#f5f5f5] ${
                                    folderId === folder.id
                                      ? "bg-[#f5f0ff] font-semibold text-[#4c00ff]"
                                      : "text-[#000]"
                                  }`}
                                  title={folder.name}
                                >
                                  <Icon name="folder" className="h-3.5 w-3.5 shrink-0 opacity-60" />
                                  <span className="truncate">{folder.name}</span>
                                </Link>
                              ))}
                              {!folders.length ? (
                                <p className="px-3 py-3 text-[12px] text-[#666]">
                                  No folders yet — create one on the right.
                                </p>
                              ) : !visibleFolders.length ? (
                                <p className="px-3 py-3 text-[12px] text-[#666]">
                                  No folders match “{folderSearch.trim()}”.
                                </p>
                              ) : null}
                            </div>
                          </div>
                        )}
                      </div>

                      {canManage && folderId ? (
                        <div className="mt-3 flex flex-col gap-2 rounded-[2px] border border-[#e0e0e0] bg-white p-3 sm:flex-row sm:flex-wrap sm:items-center">
                          <p className="w-full text-[12px] font-semibold text-[#666]">
                            Manage folder “{folderName}”
                          </p>
                          <form
                            action={renameFolderAction}
                            className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center"
                          >
                            <input type="hidden" name="folderId" value={folderId} />
                            <input
                              name="name"
                              value={renameFolderValue}
                              onChange={(event) => setRenameFolderValue(event.target.value)}
                              placeholder="Folder name"
                              required
                              className="h-9 min-w-0 flex-1 rounded-[2px] border border-[#c6c6c6] px-3 text-[13px] outline-none focus:border-[#4c00ff]"
                            />
                            <button
                              type="submit"
                              className="inline-flex h-9 shrink-0 items-center justify-center rounded-[2px] border border-[#c6c6c6] bg-white px-3 text-[13px] font-semibold text-[#000] hover:bg-[#f5f5f5]"
                            >
                              Rename
                            </button>
                          </form>
                          <form
                            action={deleteFolderAction}
                            onSubmit={(event) => {
                              if (
                                !window.confirm(
                                  `Delete folder “${folderName}”? Templates stay safe — they only leave this folder.`
                                )
                              ) {
                                event.preventDefault();
                              }
                            }}
                          >
                            <input type="hidden" name="folderId" value={folderId} />
                            <button
                              type="submit"
                              className="inline-flex h-9 w-full items-center justify-center rounded-[2px] border border-[#d94c4c] bg-white px-3 text-[13px] font-semibold text-[#d94c4c] hover:bg-[#fff5f5] sm:w-auto"
                            >
                              Delete folder
                            </button>
                          </form>
                        </div>
                      ) : (
                        <p className="mt-3 text-[12px] text-[#666]">
                          Select a folder from the dropdown to view its templates
                          {canManage ? ", rename, or delete it" : ""}.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-3 text-[12px] text-[#666]">
                      Showing all templates. Open the Folders tab to browse by folder.
                    </p>
                  )}
                </div>

                {canCreate && (
                  <form action={createFolderAction} className="flex w-full flex-col gap-2 sm:max-w-sm lg:w-auto">
                    <input type="hidden" name="kind" value="my" />
                    {allowOfficeSelection && (
                      <select
                        name="officeId"
                        defaultValue={defaultOfficeId}
                        className="h-9 rounded-[2px] border border-[#c6c6c6] bg-white px-2 text-[13px] text-[#000] outline-none focus:border-[#4c00ff]"
                      >
                        {offices.map((office) => (
                          <option key={office.id} value={office.id}>
                            {office.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {!allowOfficeSelection && defaultOfficeId ? (
                      <input type="hidden" name="officeId" value={defaultOfficeId} />
                    ) : null}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        name="name"
                        value={newFolderName}
                        onChange={(event) => setNewFolderName(event.target.value)}
                        placeholder="New folder name"
                        required
                        className="h-9 min-w-0 flex-1 rounded-[2px] border border-[#c6c6c6] bg-white px-3 text-[13px] outline-none focus:border-[#4c00ff]"
                      />
                      <button
                        type="submit"
                        className="inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-[2px] border border-[#c6c6c6] bg-white px-3 text-[13px] font-semibold text-[#000] hover:bg-[#f5f5f5]"
                      >
                        <Icon name="folder" className="h-4 w-4 text-[#666]" />
                        New Folder
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>

            {!(foldersTab && !folderId) && (
            <>
            <div ref={filtersRef} className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="relative w-full min-w-0 max-w-none flex-1 sm:min-w-[260px] sm:max-w-[380px]">
                <Icon name="search" className="absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-[#666]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={`Search ${title}`}
                  className="h-10 w-full rounded-[2px] border border-[#c6c6c6] bg-white pl-9 pr-3 text-[14px] text-[#000] outline-none placeholder:text-[#666] focus:border-[#4c00ff] sm:h-9"
                />
              </div>

              <div className="relative flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDateOpen((open) => !open);
                    setAdvancedOpen(false);
                  }}
                  className={`inline-flex h-9 items-center gap-1 rounded-[2px] border px-3 text-[13px] font-semibold ${
                    dateFilter !== "any" ? "border-[#4c00ff] bg-[#f5f0ff] text-[#4c00ff]" : "border-[#c6c6c6] bg-white text-[#000]"
                  }`}
                >
                  {dateFilterLabel(dateFilter)}
                  <Icon name="chevron" className="h-3.5 w-3.5 rotate-90 text-[#666]" />
                </button>
                {dateOpen && (
                  <div className="absolute left-0 top-10 z-30 min-w-[180px] overflow-hidden rounded-[2px] border border-[#d8d8d8] bg-white py-1 shadow-lg">
                    {(
                      [
                        ["any", "Any date"],
                        ["7d", "Last 7 days"],
                        ["30d", "Last 30 days"],
                        ["90d", "Last 90 days"],
                        ["year", "This year"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setDateFilter(value);
                          setDateOpen(false);
                        }}
                        className={`block w-full px-3 py-2 text-left text-[13px] hover:bg-[#f5f5f5] ${
                          dateFilter === value ? "bg-[#f2f2f2] font-semibold" : ""
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setAdvancedOpen((open) => !open);
                    setDateOpen(false);
                  }}
                  className={`inline-flex h-9 items-center gap-1 rounded-[2px] border px-3 text-[13px] font-semibold ${
                    statusFilter !== "any" || folderFilter || matchingOnly || hasDocsOnly
                      ? "border-[#4c00ff] bg-[#f5f0ff] text-[#4c00ff]"
                      : "border-[#c6c6c6] bg-white text-[#000]"
                  }`}
                >
                  Advanced
                  <Icon name="chevron" className="h-3.5 w-3.5 rotate-90 text-[#666]" />
                </button>
                {advancedOpen && (
                  <div className="absolute left-0 top-10 z-30 w-[min(320px,90vw)] rounded-[2px] border border-[#d8d8d8] bg-white p-3 shadow-lg sm:left-auto">
                    <label className="block text-[12px] font-semibold text-[#666]">
                      Status
                      <select
                        value={statusFilter}
                        onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                        className="mt-1 h-9 w-full rounded-[2px] border border-[#c6c6c6] px-2 text-[13px] text-[#000] outline-none focus:border-[#4c00ff]"
                      >
                        <option value="any">Any status</option>
                        <option value="draft">Draft</option>
                        <option value="published">Published</option>
                        <option value="archived">Archived</option>
                      </select>
                    </label>
                    <label className="mt-3 block text-[12px] font-semibold text-[#666]">
                      Folder
                      <select
                        value={folderFilter}
                        onChange={(event) => setFolderFilter(event.target.value)}
                        className="mt-1 h-9 w-full rounded-[2px] border border-[#c6c6c6] px-2 text-[13px] text-[#000] outline-none focus:border-[#4c00ff]"
                      >
                        <option value="">Any folder</option>
                        {folders.map((folder) => (
                          <option key={folder.id} value={folder.id}>
                            {folder.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="mt-3 flex items-center gap-2 text-[13px] text-[#000]">
                      <input
                        type="checkbox"
                        checked={matchingOnly}
                        onChange={(event) => setMatchingOnly(event.target.checked)}
                        className="h-4 w-4 accent-[#4c00ff]"
                      />
                      Matching eligible only
                    </label>
                    <label className="mt-2 flex items-center gap-2 text-[13px] text-[#000]">
                      <input
                        type="checkbox"
                        checked={hasDocsOnly}
                        onChange={(event) => setHasDocsOnly(event.target.checked)}
                        className="h-4 w-4 accent-[#4c00ff]"
                      />
                      Has documents only
                    </label>
                    <button
                      type="button"
                      onClick={() => setAdvancedOpen(false)}
                      className="mt-3 h-8 w-full rounded-[2px] bg-[#4c00ff] text-[12px] font-semibold text-white"
                    >
                      Apply
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={clearFilters}
                  disabled={!filtersActive}
                  className="h-9 px-2 text-[13px] font-semibold text-[#666] hover:text-[#000] disabled:cursor-default disabled:opacity-40"
                >
                  Clear
                </button>
              </div>

              <div className="flex items-center gap-2 sm:ml-auto">
                {canCreate && (
                  <Link
                    href={createHref}
                    className="inline-flex h-10 flex-1 items-center justify-center rounded-[2px] bg-[#4c00ff] px-4 text-[13px] font-semibold text-white hover:bg-[#3d00cf] sm:h-9 sm:flex-none"
                  >
                    Create Template
                  </Link>
                )}
                <button
                  type="button"
                  aria-label="Open advanced filters"
                  onClick={() => {
                    setAdvancedOpen((open) => !open);
                    setDateOpen(false);
                  }}
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-[2px] border sm:h-9 sm:w-9 ${
                    advancedOpen || statusFilter !== "any" || folderFilter || matchingOnly || hasDocsOnly
                      ? "border-[#4c00ff] bg-[#f5f0ff] text-[#4c00ff]"
                      : "border-[#c6c6c6] text-[#666] hover:bg-[#f5f5f5]"
                  }`}
                >
                  <Icon name="filter" className="h-4 w-4" />
                </button>
              </div>
            </div>

            {filtersActive && (
              <p className="mt-3 text-[12px] text-[#666]">
                Showing {filteredTemplates.length} of {templates.length} templates
                {query.trim() ? ` for “${query.trim()}”` : ""}
              </p>
            )}
            </>
            )}
          </div>

            {foldersTab && !folderId ? (
              <div className="flex flex-col items-center px-8 py-20 text-center">
                <Icon name="folder" className="h-10 w-10 text-[#4c00ff] opacity-70" />
                <h2 className="mt-4 text-[18px] font-semibold text-[#000]">Select a folder</h2>
                <p className="mt-2 max-w-md text-[14px] text-[#666]">
                  Use the Folders dropdown above to open a folder and see its templates.
                </p>
                <button
                  type="button"
                  onClick={() => setFoldersOpen(true)}
                  className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-[2px] border border-[#4c00ff] bg-[#f5f0ff] px-4 text-[13px] font-semibold text-[#4c00ff]"
                >
                  <Icon name="folder" className="h-4 w-4" />
                  Open folders list
                </button>
              </div>
            ) : !templates.length ? (
            <div className="flex flex-col items-center px-8 py-24 text-center">
              <h2 className="text-[20px] font-semibold text-[#000]">
                {view === "favorites"
                  ? "No favorite templates"
                  : folderId
                    ? `No templates in “${folderName || "this folder"}”`
                    : "You haven't created any templates"}
              </h2>
              <p className="mt-2 max-w-lg text-[14px] text-[#666]">
                {view === "favorites"
                  ? "Star a template to add it to Favorites."
                  : folderId
                    ? "Folders hold templates (with PDF files). Open All templates, then pick this folder in the Folders column — or create a new template here."
                    : "Create reusable documents and collect signatures faster with templates."}
              </p>
              {canCreate && view !== "favorites" && (
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  {folderId ? (
                    <Link
                      href="/templates"
                      className="inline-flex h-9 items-center rounded-[2px] border border-[#c6c6c6] bg-white px-5 text-[13px] font-semibold text-[#000]"
                    >
                      Open All templates
                    </Link>
                  ) : null}
                  <Link
                    href={createHref}
                    className="inline-flex h-9 items-center rounded-[2px] bg-[#4c00ff] px-5 text-[13px] font-semibold text-white"
                  >
                    {folderId ? "Create template in this folder" : "Create a Template"}
                  </Link>
                </div>
              )}
            </div>
          ) : !filteredTemplates.length ? (
            <div className="flex flex-col items-center px-8 py-20 text-center">
              <h2 className="text-[18px] font-semibold text-[#000]">No templates match your filters</h2>
              <p className="mt-2 text-[14px] text-[#666]">Try a different search, date range, or clear filters.</p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-5 inline-flex h-9 items-center rounded-[2px] border border-[#c6c6c6] px-4 text-[13px] font-semibold text-[#000]"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div>
              <div className="divide-y divide-[#ececec] border-t border-[#e5e5e5] lg:hidden">
                {pagedTemplates.map((template) => {
                  const isFavorite = Boolean(favorites[template.id]);
                  const updated = formatDateParts(template.updatedAt);
                  const owner = officeNames[template.officeId] || "me";
                  const pfCount = powerFormCounts[template.id] || 0;
                  return (
                    <div key={template.id} className="px-4 py-4">
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          aria-label={isFavorite ? "Remove favorite" : "Add favorite"}
                          onClick={() => toggleFavorite(template.id)}
                          className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[2px] ${
                            isFavorite ? "text-[#f5a623]" : "text-[#9e9e9e]"
                          }`}
                        >
                          <Icon name="star" className="h-4 w-4" />
                        </button>
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/templates/${template.id}/edit`}
                            className="text-[15px] font-semibold text-[#000] hover:text-[#4c00ff]"
                          >
                            {template.name}
                          </Link>
                          <p className="mt-1 text-[12px] text-[#666]">
                            {owner} · Updated {updated.day}
                            {template.documents?.length
                              ? ` · ${template.documents.length} doc${template.documents.length === 1 ? "" : "s"}`
                              : ""}
                            {pfCount > 0 ? ` · ${pfCount} PowerForm${pfCount === 1 ? "" : "s"}` : ""}
                          </p>
                          {canManage && (
                            <form action={moveAction} className="mt-2">
                              <input type="hidden" name="templateId" value={template.id} />
                              <select
                                name="folderId"
                                defaultValue={template.folderIds?.[0] || ""}
                                onChange={(event) => event.currentTarget.form?.requestSubmit()}
                                className="h-8 w-full max-w-[220px] rounded-[2px] border border-[#c6c6c6] bg-white px-2 text-[12px] text-[#000] outline-none focus:border-[#4c00ff]"
                                aria-label={`Folder for ${template.name}`}
                              >
                                <option value="">No folder</option>
                                {folders.map((folder) => (
                                  <option key={folder.id} value={folder.id}>
                                    {folder.name}
                                  </option>
                                ))}
                              </select>
                            </form>
                          )}
                          <div className="mt-3">{renderRowActions(template, owner, pfCount)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[1180px] border-t border-[#e5e5e5] text-left">
                  <thead>
                    <tr className="border-b border-[#e5e5e5] text-[12px] font-semibold text-[#666]">
                      <th className="w-10 px-4 py-3">
                        <input type="checkbox" aria-label="Select all templates" className="h-4 w-4 accent-[#4c00ff]" />
                      </th>
                      <th className="w-10 px-1 py-3" aria-label="Favorite" />
                      <th className="px-3 py-3">
                        <SortHeader label="Name" column="name" />
                      </th>
                      <th className="px-3 py-3">
                        <SortHeader label="Owner" column="owner" />
                      </th>
                      <th className="px-3 py-3">PowerForms</th>
                      <th className="px-3 py-3">
                        <SortHeader label="Created Date" column="created" />
                      </th>
                      <th className="px-3 py-3">
                        <SortHeader label="Last Change" column="updated" />
                      </th>
                      <th className="px-3 py-3">Folders</th>
                      <th className="w-[140px] px-4 py-3" aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {pagedTemplates.map((template) => {
                      const isFavorite = Boolean(favorites[template.id]);
                      const created = formatDateParts(template.createdAt);
                      const updated = formatDateParts(template.updatedAt);
                      const owner = officeNames[template.officeId] || "me";
                      const currentFolderId = template.folderIds?.[0] || "";
                      const pfCount = powerFormCounts[template.id] || 0;
                      return (
                        <tr key={template.id} className="border-b border-[#ececec] hover:bg-[#fafafa]">
                          <td className="px-4 py-4 align-middle">
                            <input
                              type="checkbox"
                              aria-label={`Select ${template.name}`}
                              className="h-4 w-4 accent-[#4c00ff]"
                            />
                          </td>
                          <td className="px-1 py-4 align-middle">
                            <button
                              type="button"
                              aria-label={isFavorite ? "Remove favorite" : "Add favorite"}
                              onClick={() => toggleFavorite(template.id)}
                              className={`inline-flex h-8 w-8 items-center justify-center rounded-[2px] hover:bg-[#f2f2f2] ${
                                isFavorite ? "text-[#f5a623]" : "text-[#9e9e9e]"
                              }`}
                            >
                              <Icon name="star" className="h-4 w-4" />
                            </button>
                          </td>
                          <td className="max-w-[320px] px-3 py-4 align-middle">
                            <Link
                              href={`/templates/${template.id}/edit`}
                              className="text-[14px] font-semibold text-[#000] hover:text-[#4c00ff] hover:underline"
                            >
                              {template.name}
                            </Link>
                            <p className="mt-0.5 text-[12px] text-[#666]">
                              {template.matchingEligible ? "Eligible for matching" : "Excluded from matching"}
                              {template.documents?.length
                                ? ` · ${template.documents.length} document${template.documents.length === 1 ? "" : "s"}`
                                : ""}
                            </p>
                          </td>
                          <td className="px-3 py-4 align-middle text-[14px] text-[#000]">{owner}</td>
                          <td className="px-3 py-4 align-middle text-[14px] text-[#000]">
                            {pfCount > 0 ? (
                              <Link
                                href={`/powerforms?template=${template.id}`}
                                className="font-semibold text-[#4c00ff] hover:underline"
                              >
                                {pfCount}
                              </Link>
                            ) : (
                              ""
                            )}
                          </td>
                          <td className="px-3 py-4 align-middle text-[14px] leading-tight text-[#000]">
                            <div>{created.day}</div>
                            <div className="text-[#666]">{created.time}</div>
                          </td>
                          <td className="px-3 py-4 align-middle text-[14px] leading-tight text-[#000]">
                            <div>{updated.day}</div>
                            <div className="text-[#666]">{updated.time}</div>
                          </td>
                          <td className="px-3 py-4 align-middle text-[14px] text-[#000]">
                            {canManage ? (
                              <form action={moveAction}>
                                <input type="hidden" name="templateId" value={template.id} />
                                <select
                                  name="folderId"
                                  defaultValue={currentFolderId}
                                  onChange={(event) => event.currentTarget.form?.requestSubmit()}
                                  className="h-8 max-w-[160px] rounded-[2px] border border-[#c6c6c6] bg-white px-2 text-[12px] text-[#000] outline-none focus:border-[#4c00ff]"
                                  aria-label={`Folder for ${template.name}`}
                                >
                                  <option value="">No folder</option>
                                  {folders.map((folder) => (
                                    <option key={folder.id} value={folder.id}>
                                      {folder.name}
                                    </option>
                                  ))}
                                </select>
                              </form>
                            ) : (
                              folders.find((folder) => folder.id === currentFolderId)?.name || ""
                            )}
                          </td>
                          <td className="px-4 py-4 align-middle">{renderRowActions(template, owner, pfCount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="relative flex items-center justify-between px-4 py-4 text-[13px] text-[#666] sm:px-8">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setPageSizeOpen((open) => !open)}
                    className="inline-flex items-center gap-1 rounded-[2px] border border-[#c6c6c6] bg-white px-3 py-1.5 text-[#000]"
                  >
                    {pageSize} / Page
                    <Icon name="chevron" className="h-3.5 w-3.5 rotate-90" />
                  </button>
                  {pageSizeOpen && (
                    <div className="absolute bottom-10 left-0 z-20 min-w-[120px] overflow-hidden rounded-[2px] border border-[#d8d8d8] bg-white py-1 shadow-lg">
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <button
                          key={size}
                          type="button"
                          onClick={() => {
                            setPageSize(size);
                            setPageSizeOpen(false);
                          }}
                          className={`block w-full px-3 py-2 text-left text-[13px] hover:bg-[#f5f5f5] ${
                            pageSize === size ? "bg-[#f2f2f2] font-semibold" : ""
                          }`}
                        >
                          {size} / Page
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-[2px] border border-[#c6c6c6] disabled:opacity-40"
                    aria-label="Previous page"
                  >
                    <Icon name="chevron" className="h-4 w-4 rotate-180" />
                  </button>
                  <span className="text-[#000]">
                    Page {safePage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-[2px] border border-[#c6c6c6] disabled:opacity-40"
                    aria-label="Next page"
                  >
                    <Icon name="chevron" className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
