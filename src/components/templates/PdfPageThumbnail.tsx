"use client";

import { useEffect, useRef, useState } from "react";

export default function PdfPageThumbnail({
  src,
  className,
}: {
  src: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);

    async function render() {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        const response = await fetch(src, {
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/pdf,*/*" },
        });
        if (!response.ok || response.status === 204) throw new Error(`HTTP ${response.status}`);
        const data = new Uint8Array(await response.arrayBuffer());
        if (!data.byteLength) throw new Error("Empty PDF");
        const header = String.fromCharCode(data[0], data[1], data[2], data[3]);
        if (header !== "%PDF") throw new Error("Not a PDF");

        // Copy before getDocument — worker transfers/detaches the buffer.
        const copy = new Uint8Array(data.byteLength);
        copy.set(data);

        const pdf = await pdfjs.getDocument({
          data: copy,
          disableRange: true,
          disableStream: true,
          disableAutoFetch: true,
        }).promise;
        if (cancelled) return;
        const page = await pdf.getPage(1);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext("2d");
        if (!context) return;

        const targetWidth = 156;
        const unscaled = page.getViewport({ scale: 1 });
        const scale = targetWidth / unscaled.width;
        const viewport = page.getViewport({ scale });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);

        await page.render({ canvasContext: context, viewport }).promise;
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    void render();
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (failed) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-[#f7f5ff] ${className || ""}`}>
        <span className="text-[10px] font-semibold text-[#4c00ff]">PDF</span>
      </div>
    );
  }

  return <canvas ref={canvasRef} className={`h-full w-full object-cover object-top ${className || ""}`} />;
}
