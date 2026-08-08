"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/Icons";
import type { AuditEvent, EnvelopeRecord } from "@/lib/types";

type DateRange = "7d" | "30d" | "6m" | "1y" | "all";

function withinRange(iso: string, range: DateRange) {
  if (range === "all") return true;
  const when = new Date(iso).getTime();
  const now = Date.now();
  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "6m" ? 182 : 365;
  return now - when <= days * 24 * 60 * 60 * 1000;
}

export default function ReportsDashboard({
  title,
  view,
  envelopes,
  events,
}: {
  title: string;
  view: string;
  envelopes: EnvelopeRecord[];
  events: AuditEvent[];
}) {
  const [range, setRange] = useState<DateRange>("30d");

  const scoped = useMemo(
    () => envelopes.filter((item) => withinRange(item.updatedAt || item.createdAt, range)),
    [envelopes, range]
  );
  const scopedEvents = useMemo(
    () => events.filter((item) => withinRange(item.createdAt, range)),
    [events, range]
  );

  const completed = scoped.filter((item) => item.status === "completed").length;
  const sent = scoped.filter((item) => item.sentAt).length;
  const viewed = scoped.filter((item) => item.recipients.some((recipient) => recipient.viewedAt)).length;
  const completionRate = scoped.length ? Math.round((completed / scoped.length) * 100) : 0;

  const cards: Array<{ label: string; value: string; icon: IconName; hint: string; href: string }> = [
    {
      label: "Sent",
      value: String(sent),
      icon: "send",
      hint: "Envelopes sent to recipients",
      href: "/agreements?view=sent",
    },
    {
      label: "Viewed",
      value: String(viewed),
      icon: "file",
      hint: "Opened by at least one recipient",
      href: "/agreements?view=viewed",
    },
    {
      label: "Completed",
      value: String(completed),
      icon: "check",
      hint: "Fully signed contracts",
      href: "/agreements?view=completed",
    },
    {
      label: "Completion rate",
      value: `${completionRate}%`,
      icon: "report",
      hint: "Completed ÷ total in range",
      href: "/reports?view=envelopes",
    },
  ];

  const recipientRows = useMemo(() => {
    return scoped
      .flatMap((envelope) =>
        envelope.recipients.map((recipient) => ({
          envelopeId: envelope.id,
          envelopeTitle: envelope.title,
          name: recipient.name,
          email: recipient.email,
          status: recipient.status,
          viewedAt: recipient.viewedAt,
          signedAt: recipient.signedAt,
        }))
      )
      .sort((a, b) => String(b.viewedAt || b.signedAt || "").localeCompare(String(a.viewedAt || a.signedAt || "")))
      .slice(0, 40);
  }, [scoped]);

  return (
    <>
      <div className="border-b border-[#e5e5e5] px-6 py-6 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold tracking-[-.01em] text-[#000]">{title}</h1>
            <p className="mt-2 text-[14px] text-[#666]">Monitor contract performance and review security events.</p>
          </div>
          <label className="inline-flex h-9 items-center gap-2 rounded-[2px] border border-[#c6c6c6] bg-white px-3 text-[13px] font-semibold text-[#000]">
            <Icon name="calendar" className="h-4 w-4 text-[#666]" />
            <select
              value={range}
              onChange={(event) => setRange(event.target.value as DateRange)}
              className="bg-transparent outline-none"
              aria-label="Report date range"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="6m">Last 6 months</option>
              <option value="1y">Last year</option>
              <option value="all">All time</option>
            </select>
          </label>
        </div>
      </div>

      <div className="px-6 py-6 sm:px-8">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <Link
              key={card.label}
              href={card.href}
              className="relative block overflow-hidden rounded-[2px] border border-[#e5e5e5] bg-white px-5 py-4 shadow-[0_1px_0_rgba(0,0,0,.04)] transition hover:border-[#c4b5fd] hover:shadow-[0_4px_16px_rgba(76,0,255,.08)]"
            >
              <span className="absolute bottom-0 left-0 top-0 w-[3px] bg-[#4c00ff]" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[.06em] text-[#666]">{card.label}</p>
                  <p className="mt-2 text-[32px] font-semibold leading-none tracking-[-.02em] text-[#000]">{card.value}</p>
                  <p className="mt-2 text-[12px] text-[#666]">{card.hint}</p>
                </div>
                <span className="flex h-9 w-9 items-center justify-center rounded-[2px] bg-[#f4f0ff] text-[#4c00ff]">
                  <Icon name={card.icon} className="h-[18px] w-[18px]" />
                </span>
              </div>
            </Link>
          ))}
        </section>

        {view !== "audit" && view !== "recipients" && (
          <section className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
            <article className="rounded-[2px] border border-[#e5e5e5] bg-white p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-[16px] font-semibold text-[#000]">Envelope usage</h2>
                  <p className="mt-1 text-[12px] text-[#666]">Progress from send to completion</p>
                </div>
                <Link href="/reports?view=envelopes" className="text-[12px] font-bold text-[#4c00ff] hover:underline">
                  Full report →
                </Link>
              </div>
              <div className="mt-7 space-y-5">
                {(
                  [
                    ["Sent", sent, 100, "/agreements?view=sent"],
                    ["Viewed", viewed, sent ? Math.round((viewed / sent) * 100) : 0, "/agreements?view=viewed"],
                    [
                      "Completed",
                      completed,
                      sent ? Math.round((completed / sent) * 100) : 0,
                      "/agreements?view=completed",
                    ],
                  ] as const
                ).map(([label, value, width, href]) => (
                  <Link key={label} href={href} className="block rounded-[2px] p-1 hover:bg-[#fafafa]">
                    <div className="mb-2 flex items-center justify-between text-[12px] font-semibold">
                      <span>{label}</span>
                      <span>{value}</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-[#ececec]">
                      <div
                        className="h-2.5 rounded-full bg-[#4c00ff]"
                        style={{ width: `${Math.max(4, Number(width))}%` }}
                      />
                    </div>
                  </Link>
                ))}
              </div>
            </article>
            <article className="rounded-[2px] border border-[#e5e5e5] bg-white p-6">
              <h2 className="text-[16px] font-semibold text-[#000]">Security posture</h2>
              <div className="mt-5 space-y-2">
                {[
                  "Secure session cookies",
                  "Email OTP verification",
                  "Private document storage",
                  "SHA-256 document hashes",
                  "Office data isolation",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3 rounded-[2px] bg-[#fafafa] px-3 py-2.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#ddf8e9] text-[#087a4a]">
                      <Icon name="check" className="h-4 w-4" />
                    </span>
                    <span className="text-[14px] font-semibold text-[#000]">{item}</span>
                  </div>
                ))}
              </div>
            </article>
          </section>
        )}

        {view === "recipients" ? (
          <section className="mt-6 overflow-hidden rounded-[2px] border border-[#e5e5e5] bg-white">
            <div className="flex items-center justify-between border-b border-[#e5e5e5] px-6 py-4">
              <h2 className="text-[16px] font-semibold text-[#000]">Recipient activity</h2>
              <Link href="/agreements?view=viewed" className="text-[12px] font-bold text-[#4c00ff] hover:underline">
                Open contracts →
              </Link>
            </div>
            <div className="divide-y divide-[#ececec]">
              {recipientRows.length === 0 ? (
                <p className="px-6 py-16 text-center text-[14px] text-[#666]">No recipient activity in this date range.</p>
              ) : (
                recipientRows.map((row, index) => (
                  <Link
                    key={`${row.envelopeId}-${row.email}-${index}`}
                    href={`/envelopes/${row.envelopeId}`}
                    className="grid gap-3 px-6 py-4 hover:bg-[#fafafa] md:grid-cols-[1fr_160px_150px] md:items-center"
                  >
                    <div>
                      <p className="text-[14px] font-semibold text-[#000]">{row.name}</p>
                      <p className="mt-1 text-[12px] text-[#666]">
                        {row.email} · {row.envelopeTitle}
                      </p>
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-[.08em] text-[#4c00ff]">
                      {row.status.replaceAll("_", " ")}
                    </span>
                    <span className="text-[12px] text-[#666] md:text-right">
                      {row.signedAt
                        ? `Signed ${new Date(row.signedAt).toLocaleString()}`
                        : row.viewedAt
                          ? `Viewed ${new Date(row.viewedAt).toLocaleString()}`
                          : "No activity yet"}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </section>
        ) : null}

        {view === "envelopes" ? (
          <section className="mt-6 overflow-hidden rounded-[2px] border border-[#e5e5e5] bg-white">
            <div className="flex items-center justify-between border-b border-[#e5e5e5] px-6 py-4">
              <h2 className="text-[16px] font-semibold text-[#000]">Envelope usage detail</h2>
              <Link href="/agreements" className="text-[12px] font-bold text-[#4c00ff] hover:underline">
                All contracts →
              </Link>
            </div>
            <div className="divide-y divide-[#ececec]">
              {scoped.length === 0 ? (
                <p className="px-6 py-16 text-center text-[14px] text-[#666]">No envelopes in this date range.</p>
              ) : (
                scoped.slice(0, 40).map((envelope) => (
                  <Link
                    key={envelope.id}
                    href={`/envelopes/${envelope.id}`}
                    className="grid gap-3 px-6 py-4 hover:bg-[#fafafa] md:grid-cols-[1fr_120px_150px] md:items-center"
                  >
                    <div>
                      <p className="text-[14px] font-semibold text-[#000]">{envelope.title}</p>
                      <p className="mt-1 text-[12px] text-[#666]">{envelope.envelopeNumber}</p>
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-[.08em] text-[#4c00ff]">
                      {envelope.status}
                    </span>
                    <span className="text-[12px] text-[#666] md:text-right">
                      {new Date(envelope.updatedAt || envelope.createdAt).toLocaleString()}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </section>
        ) : null}

        {view !== "recipients" && view !== "envelopes" ? (
          <section className="mt-6 overflow-hidden rounded-[2px] border border-[#e5e5e5] bg-white">
            <div className="flex items-center justify-between border-b border-[#e5e5e5] px-6 py-4">
              <h2 className="text-[16px] font-semibold text-[#000]">Audit events</h2>
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-[#666]">{scopedEvents.length} in selected range</span>
                {view !== "audit" ? (
                  <Link href="/reports?view=audit" className="text-[12px] font-bold text-[#4c00ff] hover:underline">
                    Open audit →
                  </Link>
                ) : null}
              </div>
            </div>
            <div className="divide-y divide-[#ececec]">
              {scopedEvents.length === 0 ? (
                <p className="px-6 py-16 text-center text-[14px] text-[#666]">No audit events in this date range.</p>
              ) : (
                scopedEvents.slice(0, view === "audit" ? 100 : 40).map((event) => (
                  <div
                    key={event.id}
                    className="grid gap-3 px-6 py-4 md:grid-cols-[160px_1fr_150px] md:items-center"
                  >
                    <span className="text-[11px] font-bold uppercase tracking-[.08em] text-[#4c00ff]">
                      {event.type.replaceAll("_", " ")}
                    </span>
                    <div>
                      <p className="text-[14px] font-semibold text-[#000]">{event.message}</p>
                      <p className="mt-1 text-[11px] text-[#948a9e]">{event.ipAddress || "Server event"}</p>
                      {event.envelopeId ? (
                        <Link
                          href={`/envelopes/${event.envelopeId}`}
                          className="mt-1 inline-block text-[11px] font-bold text-[#4c00ff] hover:underline"
                        >
                          Open envelope →
                        </Link>
                      ) : null}
                    </div>
                    <span className="text-[12px] text-[#666] md:text-right">
                      {new Date(event.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
