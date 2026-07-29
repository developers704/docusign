"use client";

import { Icon } from "@/components/Icons";

export default function SignCompleteDownloads({
  token,
  completed,
  title,
}: {
  token: string;
  completed: boolean;
  title: string;
}) {
  const signedHref = `/api/sign/${encodeURIComponent(token)}/download?type=signed`;
  const originalHref = `/api/sign/${encodeURIComponent(token)}/download?type=original`;

  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center text-emerald-950 app-shadow">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-emerald-700">
        <Icon name="check" className="h-6 w-6" />
      </span>
      <h2 className="mt-4 text-lg font-extrabold">
        {completed ? "Signing complete" : "Your signature was recorded"}
      </h2>
      <p className="mt-2 text-xs leading-5 text-emerald-900/80">
        {completed
          ? `${title} is fully signed. Download your copies below.`
          : "Waiting for the next recipient. You can still download the original document."}
      </p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
        {completed ? (
          <a
            href={signedHref}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#4c00ff] px-4 py-3 text-xs font-extrabold text-white hover:bg-[#3d00cf]"
          >
            <Icon name="download" className="h-4 w-4" />
            Download completed PDF
          </a>
        ) : (
          <a
            href={signedHref}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#4c00ff] px-4 py-3 text-xs font-extrabold text-white hover:bg-[#3d00cf]"
          >
            <Icon name="download" className="h-4 w-4" />
            Download signed copy
          </a>
        )}
        <a
          href={originalHref}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-3 text-xs font-extrabold text-emerald-950 hover:bg-emerald-100/60"
        >
          <Icon name="file" className="h-4 w-4" />
          Download original PDF
        </a>
      </div>
    </section>
  );
}
