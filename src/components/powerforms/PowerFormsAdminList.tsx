"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { PowerFormRecord } from "@/lib/types";

export default function PowerFormsAdminList({
  forms,
  templateNames,
  officeNames = {},
  appUrl,
}: {
  forms: PowerFormRecord[];
  templateNames: Record<string, string>;
  officeNames?: Record<string, string>;
  appUrl: string;
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
    <div className="mt-6 overflow-x-auto">
      <table className="w-full border-t border-[#e5e5e5] text-left">
        <thead>
          <tr className="border-b border-[#e5e5e5] text-[12px] font-semibold text-[#666]">
            <th className="px-3 py-3">Name</th>
            <th className="px-3 py-3">Workspace</th>
            <th className="px-3 py-3">Template</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3">Access</th>
            <th className="px-3 py-3">Submissions</th>
            <th className="px-3 py-3">Link</th>
            <th className="px-3 py-3">Actions</th>
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
                <button type="button" onClick={() => copyLink(form)} className="font-semibold text-[#4c00ff] hover:underline">
                  {copiedId === form.id ? "Copied" : "Copy link"}
                </button>
              </td>
              <td className="px-3 py-4 text-[13px]">
                <div className="flex flex-wrap gap-2">
                  <Link href={`/powerforms/edit/${form.id}`} className="font-semibold text-[#4c00ff] hover:underline">
                    Edit
                  </Link>
                  <Link href={`/powerforms/manage/${form.id}`} className="font-semibold text-[#4c00ff] hover:underline">
                    Submissions
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
