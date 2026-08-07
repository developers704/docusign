"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type PdfJsModule = typeof import("pdfjs-dist");
type PdfDocument = Awaited<ReturnType<PdfJsModule["getDocument"]>["promise"]>;

let pdfjsPromise: Promise<PdfJsModule> | null = null;
/** Owned copies only — never hand the cached buffer to pdf.js (worker detaches it). */
const pdfDataCache = new Map<string, Uint8Array>();

function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

function copyBytes(source: Uint8Array) {
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return copy;
}

async function fetchPdfBytes(src: string) {
  const cached = pdfDataCache.get(src);
  if (cached?.byteLength) return copyBytes(cached);

  const response = await fetch(src, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/pdf,*/*" },
  });

  if (!response.ok || response.status === 204) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      detail?.trim()
        ? `HTTP ${response.status}: ${detail.trim().slice(0, 160)}`
        : `HTTP ${response.status} while loading PDF`
    );
  }

  const buffer = await response.arrayBuffer();
  if (!buffer.byteLength) {
    throw new Error("PDF response was empty (0 bytes). Hard-refresh after restarting npm run dev.");
  }

  const bytes = new Uint8Array(buffer);
  const header = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (header !== "%PDF") {
    const asText = new TextDecoder().decode(bytes.slice(0, 160)).trim();
    throw new Error(asText || "Server did not return a PDF file.");
  }

  if (pdfDataCache.size > 8) {
    const first = pdfDataCache.keys().next().value;
    if (first) pdfDataCache.delete(first);
  }
  // Cache an owned copy; callers always receive another copy via copyBytes.
  pdfDataCache.set(src, copyBytes(bytes));
  return bytes;
}

async function openPdf(src: string) {
  const [pdfjs, bytes] = await Promise.all([loadPdfJs(), fetchPdfBytes(src)]);
  // Fresh copy for the worker — pdf.js transfers/detaches the ArrayBuffer.
  return pdfjs.getDocument({
    data: copyBytes(bytes),
    disableRange: true,
    disableStream: true,
    disableAutoFetch: true,
  }).promise;
}

/** Renders one PDF page to canvas. */
export default function PdfPageCanvas({
  src,
  pageNumber = 1,
  className,
  onRendered,
  pdfDocument,
}: {
  src: string;
  pageNumber?: number;
  className?: string;
  onRendered?: (size: { width: number; height: number }) => void;
  /** Optional shared document (avoids re-open per page). */
  pdfDocument?: PdfDocument | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    async function render() {
      try {
        const pdf = pdfDocument || (await openPdf(src));
        if (cancelled) return;

        const safePage = Math.min(Math.max(1, pageNumber), pdf.numPages);
        const page = await pdf.getPage(safePage);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext("2d");
        if (!context) return;

        const container = canvas.parentElement;
        const targetWidth = Math.max(320, Math.min(container?.clientWidth || 760, 900));
        const unscaled = page.getViewport({ scale: 1 });
        const displayScale = targetWidth / unscaled.width;
        const pixelRatio = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
        const viewport = page.getViewport({ scale: displayScale * pixelRatio });

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.style.width = `${Math.ceil(unscaled.width * displayScale)}px`;
        canvas.style.height = `${Math.ceil(unscaled.height * displayScale)}px`;

        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport }).promise;
        if (cancelled) return;

        setLoading(false);
        onRendered?.({
          width: Math.ceil(unscaled.width * displayScale),
          height: Math.ceil(unscaled.height * displayScale),
        });
      } catch (err) {
        if (!cancelled) {
          setLoading(false);
          setError(err instanceof Error ? err.message : "Document could not be loaded.");
        }
      }
    }

    void render();
    return () => {
      cancelled = true;
    };
  }, [src, pageNumber, onRendered, pdfDocument]);

  return (
    <div className={`relative w-full bg-white ${className || ""}`}>
      {loading && !error && (
        <div className="absolute inset-0 z-10 flex min-h-[240px] items-center justify-center bg-white/90 text-sm font-semibold text-[#666]">
          Loading document…
        </div>
      )}
      {error ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 bg-[#fafafa] p-6 text-center">
          <p className="text-sm font-semibold text-red-700">Document preview failed</p>
          <p className="max-w-md text-xs text-[#666]">{error}</p>
          <a href={src} target="_blank" rel="noreferrer" className="text-sm font-bold text-[#4c00ff] hover:underline">
            Open PDF in new tab
          </a>
        </div>
      ) : (
        <canvas ref={canvasRef} className="mx-auto block h-auto w-full max-w-full bg-white" />
      )}
    </div>
  );
}

/** Scrollable multi-page PDF viewer for envelope detail / signing. */
export function EnvelopePdfViewer({
  src,
  title,
  pageOverlay,
  endSlot,
  fillHeight = false,
  onNearEnd,
  scrollRootId,
}: {
  src: string;
  title: string;
  /** Optional overlays per page (e.g. Sign Here tabs for the current recipient). */
  pageOverlay?: (pageNumber: number) => ReactNode;
  /** Rendered after the last page inside the same scroll (e.g. consent + Finish). */
  endSlot?: ReactNode;
  /** Use nearly full viewport height (signing flow). */
  fillHeight?: boolean;
  /** Fires when the user scrolls near / away from the bottom. */
  onNearEnd?: (nearEnd: boolean) => void;
  /** Optional id on the scroll container (for scroll-to-end controls). */
  scrollRootId?: string;
}) {
  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const endSentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let loaded: PdfDocument | null = null;

    async function load() {
      try {
        loaded = await openPdf(src);
        if (cancelled) {
          void loaded.destroy();
          return;
        }
        setPdf(loaded);
        setPageCount(loaded.numPages);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Document could not be loaded.");
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (loaded) void loaded.destroy();
    };
  }, [src]);

  useEffect(() => {
    if (!onNearEnd || !fillHeight) return;
    const root = scrollRef.current;
    const target = endSentinelRef.current;
    if (!root || !target) return;

    const markIfFits = () => {
      if (root.scrollHeight <= root.clientHeight + 32) onNearEnd(true);
    };
    markIfFits();
    const fitTimer = window.setTimeout(markIfFits, 600);

    const observer = new IntersectionObserver(
      ([entry]) => {
        onNearEnd(Boolean(entry?.isIntersecting));
      },
      { root, rootMargin: "120px 0px 120px 0px", threshold: 0.01 }
    );
    observer.observe(target);
    return () => {
      window.clearTimeout(fitTimer);
      observer.disconnect();
    };
  }, [onNearEnd, fillHeight, pageCount, endSlot]);

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="font-semibold text-red-800">Document could not be shown</p>
        <p className="mt-2 text-sm text-red-700">{error}</p>
        <a href={src} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm font-bold text-[#4c00ff]">
          Open PDF in new tab
        </a>
      </div>
    );
  }

  if (!pdf || !pageCount) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-500 ${
          fillHeight ? "h-[calc(100dvh-3.5rem)]" : "h-[480px]"
        }`}
      >
        Loading document…
      </div>
    );
  }

  return (
    <div
      id={scrollRootId}
      ref={scrollRef}
      className={
        fillHeight
          ? // Mobile: equal left/right gutters + bottom room for fixed scroll CTA. Desktop: left margin for Start/Sign tab.
            "h-[calc(100dvh-3.5rem)] space-y-3 overflow-y-auto overscroll-contain bg-[#e8e8ee] px-2.5 py-2 pb-20 sm:space-y-4 sm:px-3 sm:pb-3 sm:pl-16 sm:py-3"
          : "max-h-[min(780px,70dvh)] space-y-4 overflow-y-auto rounded-xl border border-[#e2e8f0] bg-[#e8e8ee] p-2.5 sm:p-4 sm:pl-16"
      }
    >
      {Array.from({ length: pageCount }, (_, index) => (
        <div key={`${src}-${index + 1}`} className="mx-auto w-full max-w-[1100px] overflow-visible rounded-lg bg-white shadow">
          <p className="border-b border-slate-100 px-2.5 py-1.5 text-[10px] font-semibold text-slate-500 sm:px-3 sm:text-[11px]">
            {title} · Page {index + 1} of {pageCount}
          </p>
          <div className="relative overflow-visible">
            <PdfPageCanvas src={src} pageNumber={index + 1} pdfDocument={pdf} />
            {pageOverlay?.(index + 1)}
          </div>
        </div>
      ))}
      {endSlot ? (
        <div
          ref={endSentinelRef}
          className="mx-auto w-full max-w-[1100px] pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          {endSlot}
        </div>
      ) : (
        <div ref={endSentinelRef} className="h-1 w-full shrink-0" aria-hidden />
      )}
    </div>
  );
}
