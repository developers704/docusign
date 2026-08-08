"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DocumentField, DocumentFieldType, EnvelopeRecord, RecipientRecord, WorkflowType } from "@/lib/types";
import {
  envelopeHasSigningOrder,
  recipientRoleLabel,
  setEnvelopeRecipientOrder,
  sortEnvelopeRecipients,
  splitEnvelopeRecipients,
} from "@/lib/recipientFormUtils";
import { Icon, type IconName } from "./Icons";
import PdfPageCanvas from "./PdfPageCanvas";
import ScheduleDateTimeFields, { useDetectedTimeZone } from "./ScheduleDateTimeFields";
import { toDateTimeLocalValue, wallTimeInZoneToUtcIso } from "@/lib/timezone";

const standardPalette: Array<{ type: DocumentFieldType; label: string; icon: IconName; w: number; h: number }> = [
  { type: "signature", label: "Signature", icon: "agreement", w: 14, h: 2.4 },
  { type: "initials", label: "Initial", icon: "template", w: 8, h: 2.2 },
  { type: "date", label: "Date Signed", icon: "calendar", w: 14, h: 2.2 },
  { type: "name", label: "Name", icon: "contact", w: 16, h: 2.2 },
  { type: "email", label: "Email", icon: "contact", w: 18, h: 2.2 },
  { type: "signer_company", label: "Company", icon: "office", w: 16, h: 2.2 },
  { type: "signer_title", label: "Title", icon: "team", w: 14, h: 2.2 },
  { type: "phone", label: "Phone Number", icon: "contact", w: 14, h: 2.2 },
  { type: "text", label: "Text", icon: "file", w: 16, h: 2.4 },
  { type: "number", label: "Number", icon: "file", w: 12, h: 2.2 },
  { type: "checkbox", label: "Checkbox", icon: "check", w: 3, h: 2.4 },
  { type: "radio_group", label: "Radio", icon: "check", w: 12, h: 3.5 },
];

/** Pre-fill: sender fills before send; assigned to the selected signer above. */
const prefillPalette: Array<{ type: DocumentFieldType; label: string; icon: IconName; w: number; h: number }> = [
  { type: "text", label: "Text", icon: "file", w: 16, h: 2.4 },
  { type: "checkbox", label: "Checkbox", icon: "check", w: 3, h: 2.4 },
  { type: "radio_group", label: "Radio", icon: "check", w: 12, h: 3.5 },
  { type: "name", label: "Name", icon: "contact", w: 16, h: 2.2 },
  { type: "signer_company", label: "Company", icon: "office", w: 16, h: 2.2 },
  { type: "number", label: "Number", icon: "file", w: 12, h: 2.2 },
];

const palette = standardPalette;

const recipientColors = ["#6d28d9", "#047857", "#b45309", "#be123c", "#0369a1"];
/** Vertical/horizontal gap (%) so fields never sit on top of each other. */
const FIELD_GAP = 1.1;

type FieldBox = { x: number; y: number; width: number; height: number };

function boxesOverlap(a: FieldBox, b: FieldBox, gap = FIELD_GAP) {
  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  );
}

/** Push a new/moved field clear of others on the same page (prefer stack below). */
function findClearPosition(
  others: DocumentField[],
  page: number,
  box: FieldBox,
  excludeId?: string
): FieldBox {
  let { x, y, width, height } = box;
  const peers = others.filter((field) => field.page === page && field.id !== excludeId);
  for (let attempt = 0; attempt < 48; attempt += 1) {
    const hit = peers.find((field) => boxesOverlap({ x, y, width, height }, field));
    if (!hit) break;
    // Stack under the overlapping field first (clean Sign → Name → Date column).
    const below = hit.y + hit.height + FIELD_GAP;
    if (below + height <= 100) {
      y = below;
      x = hit.x;
      continue;
    }
    // Else try to the right on the same row.
    const right = hit.x + hit.width + FIELD_GAP;
    if (right + width <= 100) {
      x = right;
      y = hit.y;
      continue;
    }
    // Last resort: above.
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

export default function PrepareEditor({
  envelope,
  pageSizes,
}: {
  envelope: EnvelopeRecord;
  pageSizes: Array<{ width: number; height: number }>;
}) {
  const router = useRouter();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  const [recipients, setRecipients] = useState<RecipientRecord[]>(() =>
    [...envelope.recipients].sort((a, b) => a.order - b.order)
  );
  const [signingStepDraft, setSigningStepDraft] = useState<Record<string, string>>({});
  const [recipientId, setRecipientId] = useState(
    () => splitEnvelopeRecipients(envelope.recipients).signers[0]?.id || envelope.recipients[0]?.id || ""
  );
  const [fields, setFields] = useState<DocumentField[]>(envelope.fields || []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const [busy, setBusy] = useState(false);
  /** Phone numbers entered during prepare (keyed by recipient) when contact had none. */
  const [recipientPhones, setRecipientPhones] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      envelope.recipients
        .filter((recipient) => String(recipient.phone || "").trim())
        .map((recipient) => [recipient.id, String(recipient.phone).trim()])
    )
  );
  const [placeTool, setPlaceTool] = useState<{
    type: DocumentFieldType;
    label: string;
    w: number;
    h: number;
    prefill?: boolean;
  } | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [sendPanelOpen, setSendPanelOpen] = useState(false);
  const [sendMode, setSendMode] = useState<"now" | "schedule">(
    envelope.status === "scheduled" ? "schedule" : "now"
  );
  const [timeZone, setTimeZone] = useDetectedTimeZone(envelope.scheduledTimezone);
  const [scheduleAt, setScheduleAt] = useState("");
  const [scheduleSeeded, setScheduleSeeded] = useState(false);

  useEffect(() => {
    if (scheduleSeeded || !timeZone) return;
    if (envelope.scheduledSendAt) {
      setScheduleAt(toDateTimeLocalValue(envelope.scheduledSendAt, timeZone));
      setSendMode("schedule");
      setSendPanelOpen(true);
    } else {
      try {
        const raw = sessionStorage.getItem(`esign_schedule_${envelope.id}`);
        if (raw) {
          const parsed = JSON.parse(raw) as { scheduledSendAt?: string; scheduledTimezone?: string };
          if (parsed.scheduledSendAt) {
            const zone = parsed.scheduledTimezone || timeZone;
            setTimeZone(zone);
            setScheduleAt(toDateTimeLocalValue(parsed.scheduledSendAt, zone));
            setSendMode("schedule");
            setSendPanelOpen(true);
            sessionStorage.removeItem(`esign_schedule_${envelope.id}`);
            setScheduleSeeded(true);
            return;
          }
        }
      } catch {
        // ignore
      }
      setScheduleAt(toDateTimeLocalValue(new Date(Date.now() + 60 * 60 * 1000), timeZone));
    }
    setScheduleSeeded(true);
  }, [scheduleSeeded, timeZone, envelope.scheduledSendAt, envelope.id, setTimeZone]);

  const selected = fields.find((f) => f.id === selectedId) || null;
  const visible = fields.filter((f) => f.page === page);
  const recipientMap = useMemo(
    () => new Map(recipients.map((r, i) => [r.id, { ...r, color: recipientColors[i % recipientColors.length] }])),
    [recipients]
  );
  const { signers: actionable } = useMemo(() => splitEnvelopeRecipients(recipients), [recipients]);
  const signingOrderActive = useMemo(() => envelopeHasSigningOrder(actionable), [actionable]);
  const missingSigners = actionable.filter(
    (recipient) => !fields.some((field) => field.recipientId === recipient.id && field.type === "signature")
  );

  const orderedSigners = useMemo(
    () => sortEnvelopeRecipients(actionable),
    [actionable]
  );

  useEffect(() => {
    if (!placeTool) {
      setGhostPos(null);
      return;
    }
    function onMove(event: PointerEvent) {
      setGhostPos({ x: event.clientX, y: event.clientY });
    }
    function cancelPlacement(note = "Placement cancelled.") {
      setPlaceTool(null);
      setGhostPos(null);
      setMessage(note);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") cancelPlacement();
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      // Document click places the field (handled by onDocumentPointerDown).
      if (canvasRef.current?.contains(target)) return;
      // Field palette / tool buttons: allow switching tools without clearing first.
      if (target.closest("[data-place-tool]")) return;
      // Explicit cancel control.
      if (target.closest("[data-place-cancel]")) return;
      // Anywhere else (sidebars, header, page chrome) drops the holding field.
      cancelPlacement();
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown, true);
    document.body.style.cursor = "crosshair";
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown, true);
      document.body.style.cursor = "";
    };
  }, [placeTool]);

  function patchRadioOption(fieldId: string, index: number, value: string) {
    setFields((current) =>
      current.map((field) => {
        if (field.id !== fieldId) return field;
        const options = [...(field.options || [])];
        options[index] = value;
        return { ...field, options: options.slice(0, 12) };
      })
    );
  }

  function removeRadioOption(fieldId: string, index: number) {
    const field = fields.find((item) => item.id === fieldId);
    if (!field?.options?.length) return;
    patch(fieldId, { options: field.options.filter((_, optionIndex) => optionIndex !== index) });
  }

  function addRadioOption(fieldId: string) {
    const field = fields.find((item) => item.id === fieldId);
    const options = field?.options || [];
    if (options.length >= 12) {
      setMessage("Maximum 12 radio options.");
      return;
    }
    patch(fieldId, { options: [...options, `Option ${options.length + 1}`] });
  }

  useEffect(() => {
    if (!sendPanelOpen || busy) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Enter" || event.shiftKey) return;
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA") return;
      event.preventDefault();
      void submitSendPanel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sendPanelOpen, busy, sendMode, scheduleAt, timeZone]);

  function pickTool(type: DocumentFieldType, label: string, w: number, h: number, prefill = false) {
    if (!recipientId) {
      setMessage("Select a signer first.");
      return;
    }
    setPlaceTool({ type, label, w, h, prefill });
    setSelectedId(null);
    setMessage(
      prefill
        ? `Place pre-fill ${label} for ${recipientMap.get(recipientId)?.name || "signer"} — click the document, or click outside to cancel.`
        : `Place ${label} — click the document, or click outside to cancel.`
    );
  }

  function signerLabel(recipient: RecipientRecord) {
    const role = recipientRoleLabel(recipient);
    if (actionable.length <= 1) return `${role} · ${recipient.name || "Unnamed"}`;
    const step = recipient.signingStep || recipient.order || 1;
    return `${role} (${step}) · ${recipient.name || "Unnamed"}`;
  }

  function renderSigningOrderSummary(compact = false) {
    if (actionable.length <= 1) return null;
    return (
      <div
        className={`border-[#e2e8f0] bg-white ${
          compact ? "rounded-lg border px-3 py-2" : "sticky bottom-0 border-t px-3 py-3 shadow-[0_-4px_16px_rgba(0,0,0,.06)] sm:px-6"
        }`}
      >
        <p className="text-[10px] font-black uppercase tracking-[.16em] text-[#8f8497]">
          {signingOrderActive ? "Signing order" : "Recipients"}
        </p>
        <ol className={`mt-2 flex flex-wrap gap-2 ${compact ? "text-[11px]" : "text-[12px]"}`}>
          {orderedSigners.map((recipient, index) => {
            const step = signingOrderActive ? recipient.signingStep || recipient.order || index + 1 : index + 1;
            const color = recipientMap.get(recipient.id)?.color;
            return (
              <li
                key={recipient.id}
                className="inline-flex items-center gap-2 rounded-lg border border-[#e5dfe8] bg-[#fcfbfd] px-2.5 py-1.5"
              >
                <span
                  className="inline-flex h-6 min-w-6 items-center justify-center rounded-full text-[11px] font-black text-white"
                  style={{ backgroundColor: color }}
                >
                  {step}
                </span>
                <span className="font-bold text-[#21004c]">{recipientRoleLabel(recipient)}</span>
                <span className="text-[#666]">{recipient.name || "Unnamed"}</span>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  function handleSigningStepChange(id: string, step: number) {
    setRecipients((current) => setEnvelopeRecipientOrder(current, id, step));
  }

  function commitSigningStepDraft(recipient: RecipientRecord, index: number) {
    const raw = signingStepDraft[recipient.id];
    const step = Math.max(1, Number(raw ?? recipient.signingStep ?? recipient.order ?? index + 1) || 1);
    handleSigningStepChange(recipient.id, step);
    setSigningStepDraft((current) => {
      const next = { ...current };
      delete next[recipient.id];
      return next;
    });
  }

  function renderSignerRows(compact = false) {
    return (
      <ul className={`space-y-2 ${compact ? "" : "mt-2"}`}>
        {actionable.map((recipient, index) => {
          const ready = fields.some(
            (field) => field.recipientId === recipient.id && field.type === "signature"
          );
          const selected = recipientId === recipient.id;
          const color = recipientMap.get(recipient.id)?.color;
          return (
            <li
              key={recipient.id}
              className={`flex items-center gap-2 rounded-xl border px-2 py-2 ${
                selected ? "bg-[#f0ebff]" : "border-[#e5dfe8] bg-white"
              }`}
              style={selected ? { borderColor: color } : undefined}
            >
              {actionable.length > 1 ? (
                <input
                  type="number"
                  min={1}
                  max={actionable.length}
                  value={
                    signingStepDraft[recipient.id] ??
                    String(recipient.signingStep || recipient.order || index + 1)
                  }
                  onChange={(event) =>
                    setSigningStepDraft((current) => ({
                      ...current,
                      [recipient.id]: event.target.value,
                    }))
                  }
                  onBlur={() => commitSigningStepDraft(recipient, index)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                  className={`rounded border border-[#c6c6c6] text-center font-bold outline-none focus:border-[#4c00ff] ${
                    compact ? "h-8 w-9 text-[12px]" : "h-9 w-11 text-[13px]"
                  }`}
                  aria-label={`Signing order for ${recipient.name}`}
                />
              ) : null}
              <button
                type="button"
                onClick={() => setRecipientId(recipient.id)}
                className={`min-w-0 flex-1 truncate text-left ${
                  compact ? "text-[12px]" : "text-[12px]"
                } ${selected ? "text-[#4c00ff]" : "text-[#334155]"}`}
              >
                <span className="block truncate text-[10px] font-bold text-[#8f8497]">
                  {recipientRoleLabel(recipient)}
                </span>
                <span className="block truncate font-bold">{recipient.name || "Unnamed"}</span>
              </button>
              <span
                className={`shrink-0 font-bold ${compact ? "text-[10px]" : "text-[10px]"} ${
                  ready ? "text-emerald-700" : "text-amber-700"
                }`}
              >
                {ready ? "Ready" : "Needs sig"}
              </span>
            </li>
          );
        })}
      </ul>
    );
  }

  function placeAt(xPercent: number, yPercent: number) {
    if (!placeTool) return;
    const assignRecipientId = recipientId;
    if (!assignRecipientId) return;
    const id = crypto.randomUUID();
    const signer = recipientMap.get(assignRecipientId);
    const width = placeTool.w;
    const height = placeTool.h;
    const desired: FieldBox = {
      x: Math.max(0, Math.min(100 - width, xPercent - width / 2)),
      y: Math.max(0, Math.min(100 - height, yPercent - height / 2)),
      width,
      height,
    };
    const clear = findClearPosition(fields, page, desired);
    const nudged = clear.x !== desired.x || clear.y !== desired.y;

    let fieldValue: string | undefined;
    let fieldOptions: string[] | undefined;

    if (placeTool.type === "phone") {
      const known = String(recipientPhones[recipientId] || signer?.phone || "").trim();
      if (known) {
        fieldValue = known;
      } else {
        const entered = window.prompt(
          `No phone on file for ${signer?.name || "this signer"}.\nEnter phone number to continue:`
        );
        if (entered === null) {
          setMessage("Phone field cancelled. Enter a number to place Phone Number.");
          return;
        }
        const phone = entered.trim();
        if (!phone) {
          setMessage("Phone number is required. Field was not placed.");
          return;
        }
        fieldValue = phone;
        setRecipientPhones((current) => ({ ...current, [recipientId]: phone }));
      }
    }

    if (placeTool.type === "radio_group") {
      fieldOptions = placeTool.prefill ? ["Yes", "No"] : ["Option 1", "Option 2"];
    }

    const field: DocumentField = {
      id,
      type: placeTool.type,
      recipientId: assignRecipientId,
      page,
      x: clear.x,
      y: clear.y,
      width,
      height,
      required: placeTool.prefill ? false : true,
      label: placeTool.prefill ? `Pre-fill ${placeTool.label}` : placeTool.label,
      tooltip:
        placeTool.prefill
          ? "__prefill__"
          : placeTool.type === "signature"
            ? `Sign here · ${signer?.name || "Signer"}`
            : placeTool.label,
      value: fieldValue,
      options: fieldOptions,
    };
    setFields((current) => [...current, field]);
    setSelectedId(id);
    setPlaceTool(null);
    setGhostPos(null);
    setMessage(
      placeTool.type === "phone" && fieldValue
        ? `Phone Number placed with ${fieldValue} for ${signer?.name || "signer"}.`
        : nudged
          ? `${placeTool.label} placed below the previous field (no overlap) for ${signer?.name || "signer"}.`
          : `${placeTool.label} placed for ${signer?.name || "signer"}.`
    );
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

  function patch(id: string, patchValue: Partial<DocumentField>) {
    setFields((current) => current.map((f) => (f.id === id ? { ...f, ...patchValue } : f)));
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
        if (clear.x === lastX && clear.y === lastY) return current;
        window.setTimeout(() => {
          setMessage("Field shifted so it does not cover another field.");
        }, 0);
        return current.map((item) =>
          item.id === field.id ? { ...item, x: clear.x, y: clear.y } : item
        );
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
        height: Math.min(Math.max(1.8, startHeight + ((e.clientY - startY) / rect.height) * 100), 100 - field.y),
      });
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function goBack() {
    router.push(`/documents/new?draft=${envelope.id}`);
  }

  function goNext() {
    setSendPanelOpen(true);
    window.setTimeout(() => {
      document.getElementById("prepare-send-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  useEffect(() => {
    if (!saveNotice) return;
    const timer = window.setTimeout(() => setSaveNotice(""), 6000);
    return () => window.clearTimeout(timer);
  }, [saveNotice]);

  async function save(send: boolean, schedule?: { iso: string; timeZone: string }) {
    if (send && missingSigners.length) {
      setSaveNotice("");
      setMessage(`Add Signature for: ${missingSigners.map((item) => item.name).join(", ")}`);
      return;
    }
    if (send) {
      const emptyPhone = fields.find(
        (field) => field.type === "phone" && field.required && !String(field.value || "").trim()
      );
      if (emptyPhone) {
        setSaveNotice("");
        setSelectedId(emptyPhone.id);
        setMessage(`Enter a phone number for “${emptyPhone.label}” before saving.`);
        return;
      }
      const emptyRadio = fields.find(
        (field) =>
          field.type === "radio_group" && (!field.options || field.options.filter(Boolean).length < 2)
      );
      if (emptyRadio) {
        setSaveNotice("");
        setSelectedId(emptyRadio.id);
        setMessage(`Add at least 2 radio options for “${emptyRadio.label}”.`);
        return;
      }
    }
    // Final pass: separate any remaining overlaps before save.
    const sorted = [...fields].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
    const resolved: DocumentField[] = [];
    for (const field of sorted) {
      const clear = findClearPosition(resolved, field.page, {
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height,
      });
      resolved.push({ ...field, x: clear.x, y: clear.y });
    }
    const nextFields = resolved;
    setFields(nextFields);
    setBusy(true);
    setSaveNotice("");
    setMessage(send ? (schedule ? "Scheduling..." : "Sending...") : "Saving draft...");
    try {
      const response = await fetch(`/api/admin/envelopes/${envelope.id}/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: nextFields,
          pageCount: pageSizes.length,
          draftOnly: !send,
          workflowType: (signingOrderActive ? "sequential" : "parallel") as WorkflowType,
          recipients: recipients.map((recipient) => ({
            id: recipient.id,
            order: recipient.order,
            signingStep: recipient.signingStep ?? recipient.order,
            roleLabel: recipientRoleLabel(recipient),
          })),
        }),
      });
      const result = (await response.json()) as { error?: string; syncedBulkCount?: number };
      if (!response.ok) {
        setMessage(result.error || "Could not save fields.");
        return;
      }
      if (result.syncedBulkCount && result.syncedBulkCount > 0) {
        sessionStorage.setItem(
          "esign_notice",
          `Signature fields applied to ${result.syncedBulkCount + 1} bulk contracts. Send the others from Contracts when ready.`
        );
      }
      if (send) {
        setMessage(schedule ? "Scheduling..." : "Sending...");
        const sendResponse = await fetch(`/api/admin/envelopes/${envelope.id}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            schedule
              ? { scheduledSendAt: schedule.iso, scheduledTimezone: schedule.timeZone }
              : {}
          ),
        });
        const sendResult = (await sendResponse.json()) as { error?: string; message?: string };
        if (!sendResponse.ok) {
          setMessage(sendResult.error || "Saved, but could not send.");
          return;
        }
        setMessage(sendResult.message || (schedule ? "Scheduled." : "Sent."));
        setSendPanelOpen(false);
        router.push(`/envelopes/${envelope.id}`);
        router.refresh();
        return;
      }
      setMessage("");
      sessionStorage.setItem(
        "esign_notice",
        `Draft saved: “${envelope.title}” is in your Drafts. You can continue preparing it anytime.`
      );
      router.push("/agreements?view=draft");
      router.refresh();
    } catch {
      setMessage("Connection error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function submitSendPanel() {
    if (sendMode === "now") {
      void save(true);
      return;
    }
    if (!scheduleAt) {
      setMessage("Pick a date and time to schedule.");
      return;
    }
    const iso = wallTimeInZoneToUtcIso(scheduleAt, timeZone);
    if (!iso) {
      setMessage("Invalid date/time for the selected time zone.");
      return;
    }
    if (new Date(iso).getTime() <= Date.now() + 30_000) {
      setMessage("Choose a time at least 1 minute in the future.");
      return;
    }
    void save(true, { iso, timeZone });
  }

  function onTimeZoneChange(next: string) {
    if (scheduleAt) {
      const previousIso = wallTimeInZoneToUtcIso(scheduleAt, timeZone);
      if (previousIso) setScheduleAt(toDateTimeLocalValue(previousIso, next));
    }
    setTimeZone(next);
  }

  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#f4f2f7] text-[#2a2040] lg:flex-row">
      {placeTool && ghostPos && (
        <div
          className="pointer-events-none fixed z-[100] flex flex-col items-center justify-center rounded-xl border border-[#c4b5fd]/80 bg-white/90 px-2.5 py-1.5 text-[10px] font-semibold text-[#5b21b6] shadow-[0_8px_24px_rgba(33,0,76,.12)] backdrop-blur-sm"
          style={{
            left: ghostPos.x,
            top: ghostPos.y,
            width: Math.max(72, placeTool.w * 4),
            height: Math.max(22, placeTool.h * 5),
            transform: "translate(-50%, -50%)",
          }}
        >
          <span>{placeTool.label}</span>
          <span className="text-[8px] font-medium text-[#7c6b8f]">{recipientMap.get(recipientId)?.name}</span>
        </div>
      )}

      <aside className="hidden w-[280px] shrink-0 overflow-y-auto border-r border-[#ebe6f0] bg-white/95 p-5 lg:block">
        <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#8a7f96]">Standard Fields</p>
        <p className="mt-2 text-[11px] leading-5 text-[#6f657c]">
          Click a field — it follows your mouse. Click the PDF to place it. Click anywhere outside the document to
          cancel.
        </p>

        <div className="mt-4">
          <p className="text-xs font-semibold text-[#2a2040]">Assign new fields to</p>
          {renderSignerRows()}
          {renderSigningOrderSummary(true)}
        </div>
        {recipientId && (
          <p
            className="mt-2 rounded-xl px-3 py-2 text-[11px] font-semibold"
            style={{
              backgroundColor: `${recipientMap.get(recipientId)?.color}14`,
              color: recipientMap.get(recipientId)?.color,
            }}
          >
            Placing for: {recipientMap.get(recipientId)?.name}
          </p>
        )}

        {placeTool && (
          <div className="mt-3 flex items-center justify-between rounded-xl border border-[#ddd6fe] bg-[#f5f3ff] px-3 py-2.5">
            <span className="text-[11px] font-semibold text-[#5b21b6]">
              Holding <span className="font-bold">{placeTool.label}</span>
            </span>
            <button
              type="button"
              data-place-cancel="1"
              className="rounded-lg px-2 py-1 text-[10px] font-semibold text-[#6d28d9] hover:bg-white"
              onClick={() => {
                setPlaceTool(null);
                setGhostPos(null);
                setMessage("Placement cancelled.");
              }}
            >
              Cancel
            </button>
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          {standardPalette.map((item) => {
            const active = placeTool?.type === item.type && !placeTool.prefill;
            return (
              <button
                key={item.type}
                type="button"
                data-place-tool="1"
                onClick={() => pickTool(item.type, item.label, item.w, item.h, false)}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-[10px] font-semibold transition ${
                  active
                    ? "border-[#a78bfa] bg-[#f5f3ff] text-[#5b21b6] shadow-sm"
                    : "border-[#eee8f3] bg-[#fbfafc] text-[#3d3550] hover:border-[#d8d0e6] hover:bg-white"
                }`}
              >
                <Icon name={item.icon} className="h-3.5 w-3.5 text-[#7c6b8f]" />
                {item.label}
              </button>
            );
          })}
        </div>

        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[.14em] text-[#8a7f96]">Pre-fill Tools</p>
        <p className="mt-1 text-[10px] leading-5 text-[#6f657c]">
          You fill these before sending. They go to whoever is selected above.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {prefillPalette.map((item) => {
            const active = placeTool?.type === item.type && placeTool.prefill;
            return (
              <button
                key={`prefill-${item.type}`}
                type="button"
                data-place-tool="1"
                onClick={() => pickTool(item.type, item.label, item.w, item.h, true)}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-[10px] font-semibold transition ${
                  active
                    ? "border-[#6ee7b7] bg-[#ecfdf5] text-[#047857] shadow-sm"
                    : "border-[#eee8f3] bg-[#fbfafc] text-[#3d3550] hover:border-[#d8d0e6] hover:bg-white"
                }`}
              >
                <Icon name={item.icon} className="h-3.5 w-3.5 text-[#7c6b8f]" />
                {item.label}
              </button>
            );
          })}
        </div>

      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
        <header className="sticky top-0 z-20 flex min-h-[56px] flex-wrap items-center justify-between gap-2 border-b border-[#e2e8f0] bg-white px-3 py-2 shadow-sm sm:h-[66px] sm:flex-nowrap sm:px-6 sm:py-0">
          <div className="min-w-0">
            <p className="text-[10px] font-black tracking-wide text-[#4c00ff] sm:text-xs">
              STEP 2 OF 3 · PREPARE FIELDS
            </p>
            <h1 className="max-w-[70vw] truncate text-base font-extrabold sm:max-w-[520px] sm:text-lg">{envelope.title}</h1>
            <p className="mt-0.5 hidden text-[10px] font-semibold text-[#74697c] sm:block">
              Recipients → Prepare → Send
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void save(false)}
              className="min-h-10 rounded-xl border border-[#e2e8f0] px-3 py-2 text-[11px] font-extrabold sm:px-4 sm:text-xs"
            >
              Save draft
            </button>
            <div className="inline-flex overflow-hidden rounded-xl border border-[#e2e8f0]">
              <button
                type="button"
                disabled={busy}
                onClick={goBack}
                className="min-h-10 border-r border-[#e2e8f0] px-3 py-2 text-[11px] font-extrabold sm:px-4 sm:text-xs"
              >
                Back
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={goNext}
                className="min-h-10 bg-[#4c00ff] px-3 py-2 text-[11px] font-extrabold text-white hover:bg-[#3d00cf] sm:px-5 sm:text-xs"
              >
                Next
              </button>
            </div>
          </div>
        </header>

        {saveNotice && (
          <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-2.5 text-center text-[13px] font-semibold text-emerald-800">
            {saveNotice}
          </div>
        )}

        {message && !saveNotice && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-[13px] font-semibold text-amber-900">
            {message}
          </div>
        )}

        {sendPanelOpen && (
          <div id="prepare-send-panel" className="border-b border-[#e2e8f0] bg-white px-3 py-4 sm:px-6">
            <div className="mx-auto mb-3 max-w-[640px]">
              <p className="text-[10px] font-black uppercase tracking-wide text-[#4c00ff]">Step 3 of 3 · Send</p>
            </div>
            <div className="mx-auto max-w-[640px] space-y-3 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
              <p className="text-sm font-semibold text-[#21004c]">How do you want to send?</p>
              <p className="text-xs text-[#64748b]">
                Schedule uses your time zone. When the time arrives, signing emails go out automatically.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-3 ${
                    sendMode === "now" ? "border-[#21004c] bg-white ring-1 ring-[#21004c]" : "border-[#e2e8f0] bg-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="prepare-send-mode"
                    checked={sendMode === "now"}
                    onChange={() => setSendMode("now")}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-semibold">Send now</span>
                    <span className="block text-xs text-[#64748b]">Email recipients immediately</span>
                  </span>
                </label>
                <label
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-3 ${
                    sendMode === "schedule" ? "border-[#4c00ff] bg-white ring-1 ring-[#4c00ff]" : "border-[#e2e8f0] bg-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="prepare-send-mode"
                    checked={sendMode === "schedule"}
                    onChange={() => setSendMode("schedule")}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-semibold">Schedule</span>
                    <span className="block text-xs text-[#64748b]">Pick date & time — email auto-sends</span>
                  </span>
                </label>
              </div>

              {sendMode === "schedule" ? (
                <ScheduleDateTimeFields
                  value={scheduleAt}
                  onChange={setScheduleAt}
                  timeZone={timeZone}
                  onTimeZoneChange={onTimeZoneChange}
                  scheduledIso={envelope.scheduledSendAt}
                />
              ) : null}

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={submitSendPanel}
                  className={`min-h-10 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                    sendMode === "schedule" ? "bg-[#4c00ff]" : "bg-[#21004c]"
                  }`}
                >
                  {busy ? "Working…" : sendMode === "schedule" ? "Schedule send" : "Save & send now"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setSendPanelOpen(false)}
                  className="min-h-10 rounded-lg border border-[#e2e8f0] bg-white px-4 py-2 text-sm font-semibold text-[#334155]"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mobile field palette */}
        <div className="border-b border-[#ebe6f0] bg-white px-3 py-2 lg:hidden">
          <p className="mb-2 text-[11px] font-semibold text-[#2a2040]">Assign new fields to</p>
          {renderSignerRows(true)}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {standardPalette.map((item) => (
              <button
                key={item.type}
                type="button"
                data-place-tool="1"
                onClick={() => pickTool(item.type, item.label, item.w, item.h, false)}
                className={`min-h-11 shrink-0 rounded-xl border px-3 text-[11px] font-semibold ${
                  placeTool?.type === item.type && !placeTool.prefill
                    ? "border-[#a78bfa] bg-[#f5f3ff] text-[#5b21b6]"
                    : "border-[#eee8f3] bg-[#fbfafc] text-[#3d3550]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mx-auto w-full max-w-[900px] p-3 sm:p-7">
          <div className="mb-4 flex items-center justify-between rounded-2xl border border-[#ebe6f0] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(33,0,76,.04)]">
            <div className="flex items-center gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-xl border border-[#ebe6f0] px-3 py-1.5 text-xs font-semibold disabled:opacity-30">
                Previous
              </button>
              <span className="text-xs font-semibold">
                Page {page} of {pageSizes.length}
              </span>
              <button
                type="button"
                disabled={page >= pageSizes.length}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-xl border border-[#ebe6f0] px-3 py-1.5 text-xs font-semibold disabled:opacity-30"
              >
                Next
              </button>
            </div>
            <span className="text-xs text-[#7d7284]">{fields.length} fields placed</span>
          </div>

          {placeTool && (
            <div className="mb-3 rounded-2xl border border-[#ddd6fe] bg-[#f8f7fc] px-4 py-2.5 text-center text-xs font-medium text-[#5b21b6]">
              Click the document to place “{placeTool.label}” · click outside to cancel
            </div>
          )}

          <div
            ref={canvasRef}
            data-prepare-canvas="1"
            onPointerDown={onDocumentPointerDown}
            className={`relative mx-auto w-full max-w-[760px] overflow-hidden rounded-sm bg-white shadow-[0_12px_40px_rgba(33,0,76,.08)] ${
              placeTool ? "cursor-crosshair ring-2 ring-[#c4b5fd]/70 ring-offset-2 ring-offset-[#f4f2f7]" : ""
            }`}
          >
            <PdfPageCanvas
              src={`/api/admin/envelopes/${envelope.id}/document`}
              pageNumber={page}
              className="pointer-events-none select-none"
            />
            {visible.map((field) => {
              const recipient = recipientMap.get(field.recipientId);
              return (
                <div
                  key={field.id}
                  data-placed-field="1"
                  role="button"
                  tabIndex={0}
                  onPointerDown={(e) => beginDrag(e, field)}
                  onClick={() => {
                    if (placeTool) return;
                    setSelectedId(field.id);
                    if (field.recipientId) setRecipientId(field.recipientId);
                  }}
                  className={`absolute flex select-none flex-col items-center justify-center overflow-visible rounded-lg border px-1 text-[10px] font-semibold shadow-[0_2px_8px_rgba(33,0,76,.08)] ${
                    placeTool ? "pointer-events-none" : "cursor-move"
                  } ${selectedId === field.id ? "ring-2 ring-[#ddd6fe]" : ""}`}
                  style={{
                    left: `${field.x}%`,
                    top: `${field.y}%`,
                    width: `${field.width}%`,
                    height: `${field.height}%`,
                    borderColor: recipient?.color,
                    color: recipient?.color,
                    backgroundColor: `${recipient?.color}18`,
                  }}
                >
                  <span className="truncate">{field.label}</span>
                  <span className="truncate text-[8px] opacity-80">{recipient?.name}</span>
                  {field.type === "phone" && field.value ? (
                    <span className="truncate text-[8px] font-bold opacity-90">{field.value}</span>
                  ) : null}
                  {field.type === "radio_group" && field.options?.length ? (
                    <span className="truncate text-[8px] opacity-80">{field.options.join(" / ")}</span>
                  ) : null}
                  {selectedId === field.id && !placeTool && (
                    <span
                      data-resize="1"
                      onPointerDown={(e) => beginResize(e, field)}
                      className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-se-resize rounded-sm border-2 border-white bg-violet-700 shadow"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {renderSigningOrderSummary()}
      </main>

      <aside className={`shrink-0 overflow-y-auto border-t border-[#e2e8f0] bg-white p-4 lg:w-[300px] lg:border-l lg:border-t-0 lg:p-5 ${selected ? "block" : "hidden lg:block"}`}>
        <p className="text-[11px] font-black uppercase tracking-[.18em] text-[#64748b]">Field properties</p>
        {!selected ? (
          <p className="mt-5 text-sm text-[#766b7e]">Click a Standard Field — it sticks to your mouse until you click the PDF.</p>
        ) : (
          <div className="mt-4 space-y-4">
            <h2 className="text-xl font-black">{selected.label}</h2>
            <label className="block text-xs font-extrabold">
              Assigned signer
              <select
                value={selected.recipientId}
                onChange={(e) => patch(selected.id, { recipientId: e.target.value })}
                className="mt-2 w-full rounded-xl border px-3 py-3 text-xs font-bold"
              >
                {recipients.map((r) => (
                  <option key={r.id} value={r.id}>
                    {signerLabel(r)}
                  </option>
                ))}
              </select>
            </label>
            {selected.tooltip === "__prefill__" ||
            ["text", "name", "signer_company", "number", "checkbox"].includes(selected.type) ? (
              <label className="block text-xs font-extrabold">
                Pre-fill value
                {selected.type === "checkbox" ? (
                  <select
                    value={selected.value === "true" ? "true" : "false"}
                    onChange={(e) => patch(selected.id, { value: e.target.value })}
                    className="mt-2 w-full rounded-xl border px-3 py-3 text-xs font-bold"
                  >
                    <option value="false">Unchecked</option>
                    <option value="true">Checked</option>
                  </select>
                ) : (
                  <input
                    type={selected.type === "number" ? "number" : "text"}
                    value={selected.value || ""}
                    onChange={(e) => patch(selected.id, { value: e.target.value })}
                    className="mt-2 w-full rounded-xl border px-3 py-3 text-xs font-bold"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                  />
                )}
              </label>
            ) : null}
            <label className="flex items-center justify-between rounded-xl border p-3 text-xs font-extrabold">
              Required
              <input type="checkbox" checked={selected.required} onChange={(e) => patch(selected.id, { required: e.target.checked })} />
            </label>
            {selected.type === "phone" ? (
              <label className="block text-xs font-extrabold">
                Phone number
                <input
                  type="tel"
                  value={selected.value || ""}
                  onChange={(e) => {
                    const phone = e.target.value;
                    patch(selected.id, { value: phone });
                    if (phone.trim()) {
                      setRecipientPhones((current) => ({ ...current, [selected.recipientId]: phone.trim() }));
                    }
                  }}
                  placeholder="e.g. +1 555 0100"
                  className="mt-2 w-full rounded-xl border px-3 py-3 text-xs font-bold"
                />
                <span className="mt-1 block text-[10px] font-semibold text-[#7d7284]">
                  Auto-filled from signer details when available. Signer cannot finish without this.
                </span>
              </label>
            ) : null}
            {selected.type === "radio_group" ? (
              <div className="block text-xs font-extrabold">
                Radio options
                <ul className="mt-2 space-y-2">
                  {(selected.options || []).map((option, index) => (
                    <li key={`${selected.id}-${index}`} className="relative pt-1">
                      <input
                        value={option}
                        onChange={(event) => patchRadioOption(selected.id, index, event.target.value)}
                        className="w-full rounded-xl border px-3 py-2.5 pr-8 text-xs font-bold"
                        placeholder={`Option ${index + 1}`}
                      />
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => removeRadioOption(selected.id, index)}
                        className="absolute right-1 top-0 flex h-4 w-4 items-center justify-center rounded-full bg-[#dc2626] text-[10px] font-black leading-none text-white shadow-sm hover:bg-[#b91c1c]"
                        aria-label={`Remove option ${index + 1}`}
                        title="Remove option"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
                {(selected.options || []).length === 0 ? (
                  <p className="mt-2 text-[11px] font-semibold text-[#74697c]">No options yet — add at least 2.</p>
                ) : null}
                <button
                  type="button"
                  onClick={() => addRadioOption(selected.id)}
                  className="mt-2 w-full rounded-xl border border-dashed border-[#c6c6c6] px-3 py-2 text-[11px] font-bold text-[#4c00ff] hover:border-[#4c00ff] hover:bg-[#f7f4ff]"
                >
                  + Add option
                </button>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setFields((current) => current.filter((f) => f.id !== selected.id));
                setSelectedId(null);
              }}
              className="w-full rounded-xl border border-red-200 px-4 py-3 text-sm font-extrabold text-red-700"
            >
              Delete field
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
