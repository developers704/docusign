"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DocumentField, DocumentFieldType, TemplateRecord } from "@/lib/types";
import { Icon, type IconName } from "@/components/Icons";
import PdfPageCanvas from "@/components/PdfPageCanvas";

const palette: Array<{ type: DocumentFieldType; label: string; icon: IconName; w: number; h: number }> = [
  { type: "signature", label: "Signature", icon: "agreement", w: 16, h: 4 },
  { type: "initials", label: "Initial", icon: "template", w: 10, h: 3.5 },
  { type: "date", label: "Date Signed", icon: "calendar", w: 16, h: 3.5 },
  { type: "name", label: "Name", icon: "contact", w: 18, h: 3.5 },
  { type: "email", label: "Email", icon: "contact", w: 20, h: 3.5 },
  { type: "phone", label: "Phone", icon: "contact", w: 16, h: 3.5 },
  { type: "text", label: "Text", icon: "file", w: 18, h: 4 },
  { type: "number", label: "Number", icon: "file", w: 14, h: 3.5 },
  { type: "checkbox", label: "Checkbox", icon: "check", w: 4, h: 4 },
];

const FIELD_GAP = 1.1;
const COLOR = "#6d28d9";

type FieldBox = { x: number; y: number; width: number; height: number };

function boxesOverlap(a: FieldBox, b: FieldBox, gap = FIELD_GAP) {
  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  );
}

function findClearPosition(others: DocumentField[], page: number, box: FieldBox, excludeId?: string): FieldBox {
  let { x, y, width, height } = box;
  const peers = others.filter((field) => field.page === page && field.id !== excludeId);
  for (let attempt = 0; attempt < 48; attempt += 1) {
    const hit = peers.find((field) => boxesOverlap({ x, y, width, height }, field));
    if (!hit) break;
    const below = hit.y + hit.height + FIELD_GAP;
    if (below + height <= 100) {
      y = below;
      x = hit.x;
      continue;
    }
    const right = hit.x + hit.width + FIELD_GAP;
    if (right + width <= 100) {
      x = right;
      y = hit.y;
      continue;
    }
    y = Math.max(0, hit.y - height - FIELD_GAP);
    x = Math.max(0, Math.min(100 - width, hit.x));
  }
  return {
    x: Math.max(0, Math.min(100 - width, x)),
    y: Math.max(0, Math.min(100 - height, y)),
    width,
    height,
  };
}

function toDocumentFields(template: TemplateRecord): DocumentField[] {
  return (template.fields || []).map((field) => ({
    id: field.id,
    type: field.type,
    recipientId: field.recipientRoleId || "signer",
    templateRoleId: field.recipientRoleId,
    page: field.page,
    x: field.x,
    y: field.y,
    width: field.width,
    height: field.height,
    required: field.required,
    label: field.label || field.type,
    tooltip: field.tooltip || field.label || field.type,
  }));
}

export type PlacedFieldPayload = {
  type: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  required: boolean;
};

export default function TemplateFieldPlacer({
  template,
  onFieldsChange,
}: {
  template: TemplateRecord;
  onFieldsChange: (fields: PlacedFieldPayload[], hasSigning: boolean) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const documentId = template.documents?.[0]?.id;
  const src = documentId ? `/api/admin/templates/${template.id}/documents/${documentId}` : "";
  const [pageCount, setPageCount] = useState(1);
  const [page, setPage] = useState(1);
  const [fields, setFields] = useState<DocumentField[]>(() => toDocumentFields(template));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placeTool, setPlaceTool] = useState<{ type: DocumentFieldType; label: string; w: number; h: number } | null>(
    null
  );
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [hint, setHint] = useState("Select a field, then click on the document where it should appear.");

  useEffect(() => {
    setFields(toDocumentFields(template));
    setPage(1);
    setSelectedId(null);
    setPlaceTool(null);
  }, [template.id]);

  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    void import("pdfjs-dist").then(async (pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const response = await fetch(src, { credentials: "include", cache: "no-store" });
      if (!response.ok || cancelled) return;
      const data = new Uint8Array(await response.arrayBuffer());
      const pdf = await pdfjs.getDocument({ data }).promise;
      if (!cancelled) setPageCount(pdf.numPages || 1);
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    const payload: PlacedFieldPayload[] = fields.map((field) => ({
      type: field.type,
      page: field.page,
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
      label: field.label,
      required: field.required,
    }));
    onFieldsChange(
      payload,
      fields.some((field) => field.type === "signature" || field.type === "initials")
    );
    // Parent callback intentionally omitted to avoid render loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPlaceTool(null);
        setGhostPos(null);
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId && !placeTool) {
        setFields((current) => current.filter((field) => field.id !== selectedId));
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, placeTool]);

  useEffect(() => {
    if (!placeTool) {
      setGhostPos(null);
      return;
    }
    function move(event: PointerEvent) {
      setGhostPos({ x: event.clientX, y: event.clientY });
    }
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [placeTool]);

  const visible = useMemo(() => fields.filter((field) => field.page === page), [fields, page]);

  function pickTool(type: DocumentFieldType, label: string, w: number, h: number) {
    setPlaceTool({ type, label, w, h });
    setHint(`Click on the document to place “${label}”.`);
  }

  function placeAt(xPercent: number, yPercent: number) {
    if (!placeTool) return;
    const id = crypto.randomUUID();
    const width = placeTool.w;
    const height = placeTool.h;
    const clear = findClearPosition(fields, page, {
      x: Math.max(0, Math.min(100 - width, xPercent - width / 2)),
      y: Math.max(0, Math.min(100 - height, yPercent - height / 2)),
      width,
      height,
    });
    const field: DocumentField = {
      id,
      type: placeTool.type,
      recipientId: template.recipientRoles?.[0]?.id || "signer",
      templateRoleId: template.recipientRoles?.[0]?.id || null,
      page,
      x: clear.x,
      y: clear.y,
      width,
      height,
      required: true,
      label: placeTool.label,
      tooltip: placeTool.label,
    };
    setFields((current) => [...current, field]);
    setSelectedId(id);
    setPlaceTool(null);
    setGhostPos(null);
    setHint(`${placeTool.label} placed. Drag to fine-tune. Delete key removes selected field.`);
  }

  function onDocumentPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!placeTool) return;
    if ((event.target as HTMLElement).closest("[data-placed-field]")) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    placeAt(((event.clientX - rect.left) / rect.width) * 100, ((event.clientY - rect.top) / rect.height) * 100);
  }

  function patch(id: string, value: Partial<DocumentField>) {
    setFields((current) => current.map((field) => (field.id === id ? { ...field, ...value } : field)));
  }

  function beginDrag(event: React.PointerEvent, field: DocumentField) {
    if (placeTool) return;
    if ((event.target as HTMLElement).dataset.resize) return;
    event.preventDefault();
    setSelectedId(field.id);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = field.x;
    const startTop = field.y;
    const rect = canvas.getBoundingClientRect();
    let lastX = startLeft;
    let lastY = startTop;
    function move(e: PointerEvent) {
      lastX = Math.max(0, Math.min(100 - field.width, startLeft + ((e.clientX - startX) / rect.width) * 100));
      lastY = Math.max(0, Math.min(100 - field.height, startTop + ((e.clientY - startY) / rect.height) * 100));
      patch(field.id, { x: lastX, y: lastY });
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setFields((current) => {
        const clear = findClearPosition(
          current,
          field.page,
          { x: lastX, y: lastY, width: field.width, height: field.height },
          field.id
        );
        return current.map((item) => (item.id === field.id ? { ...item, x: clear.x, y: clear.y } : item));
      });
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function beginResize(event: React.PointerEvent, field: DocumentField) {
    event.preventDefault();
    event.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = field.width;
    const startHeight = field.height;
    const rect = canvas.getBoundingClientRect();
    function move(e: PointerEvent) {
      patch(field.id, {
        width: Math.min(Math.max(5, startWidth + ((e.clientX - startX) / rect.width) * 100), 100 - field.x),
        height: Math.min(Math.max(3, startHeight + ((e.clientY - startY) / rect.height) * 100), 100 - field.y),
      });
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  if (!documentId || !src) {
    return (
      <div className="rounded-lg border border-[#f5c2c7] bg-[#fff5f5] px-3 py-2 text-[13px] text-[#b00020]">
        This template has no PDF document. Upload a document on the template first, then place signature fields.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#e7e2ec] bg-[#f6f3f9] p-3 sm:p-4">
      {placeTool && ghostPos ? (
        <div
          className="pointer-events-none fixed z-[100] flex items-center justify-center rounded-md border-2 border-[#4c00ff] bg-[#f0ebff]/90 px-2 text-[10px] font-extrabold text-[#4c00ff] shadow-lg"
          style={{
            left: ghostPos.x,
            top: ghostPos.y,
            width: Math.max(90, placeTool.w * 4),
            height: Math.max(28, placeTool.h * 5),
            transform: "translate(-50%, -50%)",
          }}
        >
          {placeTool.label}
        </div>
      ) : null}

      <p className="text-[13px] font-semibold text-[#21004c]">Place fields on the document</p>
      <p className="mt-1 text-[12px] text-[#6b6578]">{hint}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {palette.map((item) => (
          <button
            key={item.type}
            type="button"
            onClick={() => pickTool(item.type, item.label, item.w, item.h)}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-bold ${
              placeTool?.type === item.type
                ? "border-[#4c00ff] bg-[#f0ebff] text-[#4c00ff]"
                : "border-[#e2e8f0] bg-white text-[#21004c]"
            }`}
          >
            <Icon name={item.icon} className="h-3.5 w-3.5" />
            {item.label}
          </button>
        ))}
        {placeTool ? (
          <button
            type="button"
            onClick={() => {
              setPlaceTool(null);
              setGhostPos(null);
            }}
            className="text-[12px] font-semibold text-[#4c00ff] underline"
          >
            Cancel
          </button>
        ) : null}
      </div>

      <div className="mt-3 flex items-center justify-between rounded-lg bg-white px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded border px-2 py-1 text-[11px] font-bold disabled:opacity-30"
          >
            Prev
          </button>
          <span className="text-[11px] font-bold">
            Page {page} / {pageCount}
          </span>
          <button
            type="button"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
            className="rounded border px-2 py-1 text-[11px] font-bold disabled:opacity-30"
          >
            Next
          </button>
        </div>
        <span className="text-[11px] text-[#7d7284]">{fields.length} fields</span>
      </div>

      {placeTool ? (
        <div className="mt-2 rounded-lg border border-[#4c00ff] bg-[#f0ebff] px-3 py-2 text-center text-[12px] font-bold text-[#4c00ff]">
          Click on the document to place “{placeTool.label}”
        </div>
      ) : null}

      <div
        ref={canvasRef}
        onPointerDown={onDocumentPointerDown}
        className={`relative mx-auto mt-3 w-full max-w-[760px] overflow-hidden bg-white shadow ${
          placeTool ? "cursor-crosshair ring-2 ring-[#4c00ff] ring-offset-2" : ""
        }`}
      >
        <PdfPageCanvas src={src} pageNumber={page} className="pointer-events-none select-none" />
        {visible.map((field) => (
          <div
            key={field.id}
            data-placed-field="1"
            role="button"
            tabIndex={0}
            onPointerDown={(e) => beginDrag(e, field)}
            onClick={() => {
              if (placeTool) return;
              setSelectedId(field.id);
            }}
            className={`absolute flex select-none flex-col items-center justify-center overflow-visible rounded-md border-2 px-1 text-[10px] font-extrabold shadow-md ${
              placeTool ? "pointer-events-none" : "cursor-move"
            } ${selectedId === field.id ? "ring-4 ring-violet-200" : ""}`}
            style={{
              left: `${field.x}%`,
              top: `${field.y}%`,
              width: `${field.width}%`,
              height: `${field.height}%`,
              borderColor: COLOR,
              color: COLOR,
              backgroundColor: `${COLOR}18`,
            }}
          >
            <span className="truncate">{field.label}</span>
            {selectedId === field.id ? (
              <span
                data-resize="1"
                onPointerDown={(e) => beginResize(e, field)}
                className="absolute bottom-0 right-0 h-3 w-3 cursor-se-resize rounded-sm bg-[#4c00ff]"
              />
            ) : null}
          </div>
        ))}
      </div>

      {!fields.some((field) => field.type === "signature" || field.type === "initials") ? (
        <p className="mt-2 text-[12px] font-medium text-[#b45309]">
          Place Signature (or Initials) exactly where the person should sign.
        </p>
      ) : null}
    </div>
  );
}
