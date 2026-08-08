"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DeleteAgreementButton from "@/components/DeleteAgreementButton";
import { Icon } from "@/components/Icons";
import type { EnvelopeRecord } from "@/lib/types";

type DateRange = "7d" | "30d" | "6m" | "1y" | "all";

function statusLabel(envelope: EnvelopeRecord) {
  const waiting = envelope.recipients.find((item) => ["sent", "viewed"].includes(item.status));
  if (envelope.status === "completed") return "Completed";
  if (envelope.status === "draft") return "Draft";
  if (waiting) return `Waiting for ${waiting.name}`;
  return envelope.status.replaceAll("_", " ");
}

function withinRange(iso: string, range: DateRange) {
  if (range === "all") return true;
  const when = new Date(iso).getTime();
  const now = Date.now();
  const days =
    range === "7d" ? 7 : range === "30d" ? 30 : range === "6m" ? 182 : 365;
  return now - when <= days * 24 * 60 * 60 * 1000;
}

const DATE_OPTIONS: Array<{ value: DateRange; label: string }> = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "6m", label: "Last 6 months" },
  { value: "1y", label: "Last year" },
  { value: "all", label: "All time" },
];

export default function AgreementsWorkspace({
  title,
  envelopes,
  officeNames,
  showOffice,
  canCreate,
  canDelete = false,
}: {
  title: string;
  envelopes: EnvelopeRecord[];
  officeNames: Record<string, string>;
  showOffice: boolean;
  canCreate: boolean;
  canDelete?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("6m");
  const [sender, setSender] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const message = sessionStorage.getItem("esign_notice");
    if (!message) return;
    sessionStorage.removeItem("esign_notice");
    setNotice(message);
    const timer = window.setTimeout(() => setNotice(""), 8000);
    return () => window.clearTimeout(timer);
  }, []);

  const senders = useMemo(() => {
    return [...new Set(envelopes.map((item) => item.createdBy).filter(Boolean))].sort();
  }, [envelopes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return envelopes.filter((envelope) => {
      if (!withinRange(envelope.updatedAt, dateRange)) return false;
      if (sender && envelope.createdBy !== sender) return false;
      if (statusFilter && envelope.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [
        envelope.title,
        envelope.envelopeNumber,
        envelope.createdBy,
        ...envelope.recipients.map((item) => `${item.name} ${item.email}`),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [dateRange, envelopes, query, sender, statusFilter]);

  const dateLabel = DATE_OPTIONS.find((item) => item.value === dateRange)?.label || "Last 6 months";
  const hasFilters = Boolean(query || sender || statusFilter || dateRange !== "6m");

  function clearAll() {
    setQuery("");
    setDateRange("6m");
    setSender("");
    setStatusFilter("");
    setShowAdvanced(false);
  }

  return (
    <>
      <div className="border-b border-[#e5e5e5] px-4 py-5 sm:px-8 sm:py-6">
        <h1 className="text-[24px] font-semibold tracking-[-.01em] text-[#000] sm:text-[30px]">{title}</h1>
        {notice ? (
          <div className="mt-4 rounded-[2px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-[14px] font-semibold text-emerald-800">
            {notice}
          </div>
        ) : null}
        <div className="mt-4 flex flex-col gap-3 sm:mt-5 lg:flex-row lg:items-center">
          <div className="relative w-full max-w-none flex-1 lg:max-w-xl">
            <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#666]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search contracts and recipients"
              className="h-10 w-full rounded-[2px] border border-[#c6c6c6] bg-white pl-10 pr-3 text-[15px] outline-none placeholder:text-[#666] focus:border-[#4c00ff]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[14px]">
            <label className="inline-flex h-10 items-center gap-2 rounded-[2px] border border-[#c6c6c6] bg-white px-3 font-semibold text-[#000]">
              Date
              <select
                value={dateRange}
                onChange={(event) => setDateRange(event.target.value as DateRange)}
                className="max-w-[9rem] bg-transparent text-[14px] font-semibold outline-none sm:max-w-none"
                aria-label="Date filter"
              >
                {DATE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {dateRange !== "all" && (
              <button
                type="button"
                onClick={() => setDateRange("all")}
                className="inline-flex h-9 items-center gap-1 rounded-[2px] border border-[#c6c6c6] bg-[#f7f7f7] px-3 font-semibold text-[#000]"
              >
                {dateLabel}
                <span aria-hidden>×</span>
              </button>
            )}
            <label className="inline-flex h-9 max-w-full items-center gap-2 rounded-[2px] border border-[#c6c6c6] bg-white px-3 font-semibold text-[#000]">
              Sender
              <select
                value={sender}
                onChange={(event) => setSender(event.target.value)}
                className="max-w-[140px] bg-transparent text-[13px] font-semibold outline-none sm:max-w-[160px]"
                aria-label="Sender filter"
              >
                <option value="">All senders</option>
                {senders.map((email) => (
                  <option key={email} value={email}>
                    {email}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setShowAdvanced((value) => !value)}
              className="h-9 px-2 font-semibold text-[#4c00ff] hover:underline"
            >
              Advanced search
            </button>
            {hasFilters && (
              <button type="button" onClick={clearAll} className="h-9 px-2 font-semibold text-[#4c00ff] hover:underline">
                Clear all
              </button>
            )}
          </div>
        </div>

        {showAdvanced && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[2px] border border-[#e5e5e5] bg-[#fafafa] p-3">
            <label className="inline-flex h-9 items-center gap-2 rounded-[2px] border border-[#c6c6c6] bg-white px-3 text-[13px] font-semibold">
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="bg-transparent outline-none"
              >
                <option value="">Any status</option>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="viewed">Viewed</option>
                <option value="completed">Completed</option>
                <option value="voided">Voided</option>
              </select>
            </label>
            <p className="text-[12px] text-[#666]">
              Showing {filtered.length} of {envelopes.length} contracts
            </p>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-24 text-center">
          <h2 className="text-xl font-semibold text-[#000]">No contracts match these filters</h2>
          <p className="mt-2 max-w-md text-sm text-[#666]">
            Try clearing filters or create a new contract from Start.
          </p>
          {canCreate && (
            <Link href="/documents/new" className="mt-6 rounded-[2px] bg-[#4c00ff] px-5 py-2.5 text-sm font-bold text-white">
              Start contract
            </Link>
          )}
          {hasFilters && (
            <button type="button" onClick={clearAll} className="mt-3 text-sm font-semibold text-[#4c00ff] hover:underline">
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <div>
          {/* Mobile cards */}
          <div className="divide-y divide-[#ececec] lg:hidden">
            {filtered.map((envelope) => {
              const recipientPreview = envelope.recipients
                .slice(0, 2)
                .map((item) => item.name)
                .join(", ");
              const extra = envelope.recipients.length > 2 ? ` +${envelope.recipients.length - 2} more` : "";
              return (
                <div key={envelope.id} className="px-4 py-4">
                  <Link href={`/envelopes/${envelope.id}`} className="text-[15px] font-semibold text-[#4c00ff]">
                    {envelope.title}
                  </Link>
                  <p className="mt-1 text-[13px] font-semibold text-[#4c00ff]">{statusLabel(envelope)}</p>
                  <p className="mt-1 text-[12px] text-[#666]">
                    To: {recipientPreview}
                    {extra}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#9a93a8]">
                    {envelope.envelopeNumber} · {new Date(envelope.updatedAt).toLocaleDateString()}
                    {showOffice ? ` · ${officeNames[envelope.officeId] || envelope.officeName}` : ""}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {["draft", "scheduled"].includes(envelope.status) ? (
                      <>
                        <Link
                          href={`/prepare/${envelope.id}`}
                          className="rounded-[2px] border border-[#c6c6c6] bg-white px-3 py-2 text-[12px] font-semibold text-[#000]"
                        >
                          Prepare
                        </Link>
                        <Link
                          href={`/envelopes/${envelope.id}#send-schedule`}
                          className="rounded-[2px] bg-[#4c00ff] px-3 py-2 text-[12px] font-semibold text-white"
                        >
                          {envelope.status === "scheduled" ? "Edit schedule" : "Send / Schedule"}
                        </Link>
                      </>
                    ) : (
                      <Link
                        href={`/envelopes/${envelope.id}`}
                        className="rounded-[2px] border border-[#c6c6c6] bg-white px-3 py-2 text-[12px] font-semibold text-[#000]"
                      >
                        Open
                      </Link>
                    )}
                    {canDelete && <DeleteAgreementButton envelopeId={envelope.id} title={envelope.title} />}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto scrollbar-thin lg:block">
            <table className="w-full min-w-[980px] text-left">
              <thead>
                <tr className="border-b border-[#e5e5e5] text-[12px] font-semibold text-[#666]">
                  <th className="px-6 py-3">
                    <input type="checkbox" aria-label="Select all contracts" className="accent-[#4c00ff]" />
                  </th>
                  <th className="px-3 py-3">Name</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last change</th>
                  {showOffice && <th className="px-4 py-3">Office</th>}
                  <th className="px-4 py-3">Folder</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((envelope) => {
                  const recipientPreview = envelope.recipients
                    .slice(0, 2)
                    .map((item) => item.name)
                    .join(", ");
                  const extra = envelope.recipients.length > 2 ? ` +${envelope.recipients.length - 2} more` : "";
                  return (
                    <tr key={envelope.id} className="border-b border-[#ececec] hover:bg-[#fafafa]">
                      <td className="px-6 py-4">
                        <input type="checkbox" aria-label={`Select ${envelope.title}`} className="accent-[#4c00ff]" />
                      </td>
                      <td className="px-3 py-4">
                        <Link href={`/envelopes/${envelope.id}`} className="text-[14px] font-semibold text-[#4c00ff] hover:underline">
                          {envelope.title}
                        </Link>
                        <p className="mt-1 text-[12px] text-[#666]">
                          To: {recipientPreview}
                          {extra}
                        </p>
                        <p className="text-[11px] text-[#9a93a8]">{envelope.envelopeNumber}</p>
                      </td>
                      <td className="px-4 py-4 text-[14px] font-semibold text-[#4c00ff]">{statusLabel(envelope)}</td>
                      <td className="px-4 py-4 text-[14px] text-[#212121]">{new Date(envelope.updatedAt).toLocaleString()}</td>
                      {showOffice && (
                        <td className="px-4 py-4 text-[14px] text-[#212121]">
                          {officeNames[envelope.officeId] || envelope.officeName}
                        </td>
                      )}
                      <td className="px-4 py-4 text-[14px] text-[#4c00ff]">
                        {envelope.status === "scheduled"
                          ? "Scheduled"
                          : envelope.sentAt
                            ? "Sent items"
                            : "Drafts"}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {["draft", "scheduled"].includes(envelope.status) ? (
                            <>
                              <Link
                                href={`/prepare/${envelope.id}`}
                                className="rounded-[2px] border border-[#c6c6c6] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#000] hover:bg-[#f5f5f5]"
                              >
                                Prepare
                              </Link>
                              <Link
                                href={`/envelopes/${envelope.id}#send-schedule`}
                                className="rounded-[2px] bg-[#4c00ff] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#3d00cf]"
                              >
                                {envelope.status === "scheduled" ? "Edit schedule" : "Send / Schedule"}
                              </Link>
                            </>
                          ) : (
                            <Link
                              href={`/envelopes/${envelope.id}`}
                              className="rounded-[2px] border border-[#c6c6c6] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#000] hover:bg-[#f5f5f5]"
                            >
                              {envelope.status === "completed" ? "Open" : "Open"}
                            </Link>
                          )}
                          {canDelete && <DeleteAgreementButton envelopeId={envelope.id} title={envelope.title} />}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
