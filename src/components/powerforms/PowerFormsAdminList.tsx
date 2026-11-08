"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import PublishedFormRowActions from "@/components/powerforms/PublishedFormRowActions";
import type { PowerFormRecord } from "@/lib/types";

export default function PowerFormsAdminList({
  forms,
  templateNames,
  officeNames = {},
  appUrl,
  canManage = true,
}: {
  forms: PowerFormRecord[];
  templateNames: Record<string, string>;
  officeNames?: Record<string, string>;
  appUrl: string;
  canManage?: boolean;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const rows = useMemo(() => forms, [forms]);

  async function copyLink(form: PowerFormRecord) {
    const url = `${appUrl}/powerforms/${form.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(form.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      window.prompt("Copy PowerForm link:", url);
    }
  }

  if (!rows.length) {
    return (
      <div className="mt-16 text-center">
        <h2 className="text-[20px] font-semibold text-[#21004c]">No PowerForms yet</h2>
        <p className="mt-2 text-[14px] text-[#6b6578]">
          Create a shareable link from a published template. Each submitter gets a separate envelope.
        </p>
        <Link
          href="/powerforms/new"
          className="mt-6 inline-flex h-9 items-center rounded-[2px] bg-[#4c00ff] px-4 text-[13px] font-semibold text-white"
        >
          Create PowerForm
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {/* Mobile cards */}
      <div className="space-y-3 lg:hidden">
        {rows.map((form) => (
          <div key={form.id} className="rounded-[4px] border border-[#ececec] p-4">
            <Link href={`/powerforms/manage/${form.id}`} className="text-[15px] font-semibold text-[#1c1230]">
              {form.name}
            </Link>
            <p className="mt-1 text-[12px] text-[#666]">
              {officeNames[form.officeId] || "—"} · {form.status} · {form.submissionCount} submissions
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => copyLink(form)}
                className="inline-flex h-8 items-center rounded-[2px] border border-[#c6c6c6] bg-white px-3 text-[12px] font-semibold text-[#21004c]"
              >
                {copiedId === form.id ? "Copied" : "Copy link"}
              </button>
              <PublishedFormRowActions
                kind="powerform"
                id={form.id}
                name={form.name}
                canManage={canManage}
              />
            </div>
          </div>
        ))}
      </div>

      <table className="hidden w-full min-w-[960px] border-t border-[#e5e5e5] text-left lg:table">
        <thead>
          <tr className="border-b border-[#e5e5e5] text-[12px] font-semibold text-[#666]">
            <th className="px-3 py-3">Name</th>
            <th className="px-3 py-3">Workspace</th>
            <th className="px-3 py-3">Template</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3">Access</th>
            <th className="px-3 py-3">Submissions</th>
            <th className="px-3 py-3">Link</th>
            <th className="px-3 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((form) => (
            <tr key={form.id} className="border-b border-[#ececec]">
              <td className="px-3 py-4 text-[14px] font-semibold text-[#1c1230]">
                <Link href={`/powerforms/manage/${form.id}`} className="hover:text-[#4c00ff]">
                  {form.name}
                </Link>
              </td>
              <td className="px-3 py-4 text-[14px]">{officeNames[form.officeId] || "—"}</td>
              <td className="px-3 py-4 text-[14px]">{templateNames[form.templateId] || form.templateId}</td>
              <td className="px-3 py-4 text-[14px] capitalize">{form.status}</td>
              <td className="px-3 py-4 text-[14px]">{form.accessType.replace(/_/g, " ")}</td>
              <td className="px-3 py-4 text-[14px]">{form.submissionCount}</td>
              <td className="px-3 py-4 text-[13px]">
                <button
                  type="button"
                  onClick={() => copyLink(form)}
                  className="inline-flex h-8 items-center rounded-[2px] border border-[#c6c6c6] bg-white px-3 text-[12px] font-semibold text-[#21004c] hover:bg-[#f5f5f5]"
                >
                  {copiedId === form.id ? "Copied" : "Copy link"}
                </button>
              </td>
              <td className="whitespace-nowrap px-3 py-4 text-[13px]">
                <PublishedFormRowActions
                  kind="powerform"
                  id={form.id}
                  name={form.name}
                  canManage={canManage}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
