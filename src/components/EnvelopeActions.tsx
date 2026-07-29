"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ScheduleDateTimeFields, { useDetectedTimeZone } from "@/components/ScheduleDateTimeFields";
import { formatScheduleDisplay, toDateTimeLocalValue, wallTimeInZoneToUtcIso } from "@/lib/timezone";

async function post(url: string, body?: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { response, result: (await response.json()) as { error?: string; message?: string } };
}

export default function EnvelopeActions({
  envelopeId,
  canSend,
  canRemind,
  canVoid,
  canDelete,
  canCorrect = false,
  status,
  scheduledSendAt = null,
  scheduledTimezone = null,
}: {
  envelopeId: string;
  canSend: boolean;
  canRemind: boolean;
  canVoid: boolean;
  canDelete: boolean;
  canCorrect?: boolean;
  status?: string;
  scheduledSendAt?: string | null;
  scheduledTimezone?: string | null;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendMode, setSendMode] = useState<"now" | "schedule">(status === "scheduled" ? "schedule" : "now");
  const [timeZone, setTimeZone] = useDetectedTimeZone(scheduledTimezone);
  const [scheduleAt, setScheduleAt] = useState("");
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (seeded || !timeZone) return;
    if (scheduledSendAt) {
      setScheduleAt(toDateTimeLocalValue(scheduledSendAt, timeZone));
    } else {
      setScheduleAt(toDateTimeLocalValue(new Date(Date.now() + 60 * 60 * 1000), timeZone));
    }
    setSeeded(true);
  }, [seeded, timeZone, scheduledSendAt]);

  useEffect(() => {
    if (sendMode !== "schedule" || scheduleAt || !timeZone) return;
    setScheduleAt(toDateTimeLocalValue(new Date(Date.now() + 60 * 60 * 1000), timeZone));
  }, [sendMode, scheduleAt, timeZone]);

  async function run(url: string, body?: unknown, redirectTo?: string) {
    setBusy(true);
    setMessage("");
    try {
      const { response, result } = await post(url, body);
      setMessage(response.ok ? result.message || "Action completed." : result.error || "Action failed.");
      if (response.ok) {
        if (redirectTo) {
          router.push(redirectTo);
          router.refresh();
          return;
        }
        router.refresh();
      }
    } catch {
      setMessage("Connection error.");
    } finally {
      setBusy(false);
    }
  }

  function voidEnvelope() {
    const reason = window.prompt("Reason for voiding this envelope:");
    if (reason?.trim()) run(`/api/admin/envelopes/${envelopeId}/void`, { reason: reason.trim() });
  }

  function deleteAgreement() {
    const confirmed = window.confirm(
      "Delete this agreement permanently? Documents and signing links will be removed. This cannot be undone."
    );
    if (confirmed) run(`/api/admin/envelopes/${envelopeId}/delete`, undefined, "/agreements");
  }

  async function correctEnvelope() {
    if (
      !window.confirm(
        "Correct this envelope? You can fix emails, names, and fields, then send again. Old signing links stop working."
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const { response, result } = await post(`/api/admin/envelopes/${envelopeId}/correct`);
      if (!response.ok) {
        setMessage(result.error || "Could not correct.");
        return;
      }
      sessionStorage.setItem(
        "esign_notice",
        "Correction started. Fix recipient emails or names if needed, then continue to Prepare and send again."
      );
      router.push(`/documents/new?draft=${envelopeId}`);
      router.refresh();
    } catch {
      setMessage("Connection error.");
    } finally {
      setBusy(false);
    }
  }

  function submitSend() {
    if (sendMode === "now") {
      run(`/api/admin/envelopes/${envelopeId}/send`, {});
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
    run(`/api/admin/envelopes/${envelopeId}/send`, {
      scheduledSendAt: iso,
      scheduledTimezone: timeZone,
    });
  }

  function cancelSchedule() {
    run(`/api/admin/envelopes/${envelopeId}/send`, { cancelSchedule: true });
  }

  function onTimeZoneChange(next: string) {
    if (scheduleAt) {
      const previousIso = wallTimeInZoneToUtcIso(scheduleAt, timeZone);
      if (previousIso) setScheduleAt(toDateTimeLocalValue(previousIso, next));
    } else if (scheduledSendAt) {
      setScheduleAt(toDateTimeLocalValue(scheduledSendAt, next));
    }
    setTimeZone(next);
  }

  const isScheduled = status === "scheduled";

  return (
    <div className="space-y-3">
      {canSend && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">How do you want to send?</p>
          <p className="mt-1 text-xs text-slate-500">
            Times follow your device location / selected time zone (Pacific, Eastern, Pakistan, etc.).
          </p>

          {isScheduled && scheduledSendAt ? (
            <p className="mt-2 text-xs font-medium text-[#4c00ff]">
              Currently scheduled: {formatScheduleDisplay(scheduledSendAt, scheduledTimezone || timeZone)}
            </p>
          ) : null}

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label
              className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-3 ${
                sendMode === "now" ? "border-[#21004c] bg-white ring-1 ring-[#21004c]" : "border-slate-200 bg-white"
              }`}
            >
              <input
                type="radio"
                name={`send-mode-${envelopeId}`}
                checked={sendMode === "now"}
                onChange={() => setSendMode("now")}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-900">Send now</span>
                <span className="block text-xs text-slate-500">Email recipients immediately</span>
              </span>
            </label>
            <label
              className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-3 ${
                sendMode === "schedule" ? "border-[#4c00ff] bg-white ring-1 ring-[#4c00ff]" : "border-slate-200 bg-white"
              }`}
            >
              <input
                type="radio"
                name={`send-mode-${envelopeId}`}
                checked={sendMode === "schedule"}
                onChange={() => setSendMode("schedule")}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-900">Schedule</span>
                <span className="block text-xs text-slate-500">Auto-send in your time zone</span>
              </span>
            </label>
          </div>

          {sendMode === "schedule" ? (
            <div className="mt-3">
              <ScheduleDateTimeFields
                value={scheduleAt}
                onChange={setScheduleAt}
                timeZone={timeZone}
                onTimeZoneChange={onTimeZoneChange}
              />
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={submitSend}
              className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${
                sendMode === "schedule" ? "bg-[#4c00ff]" : "bg-[#21004c]"
              }`}
            >
              {sendMode === "schedule" ? "Schedule send" : "Send now"}
            </button>
            {isScheduled ? (
              <button
                type="button"
                disabled={busy}
                onClick={cancelSchedule}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50"
              >
                Cancel schedule
              </button>
            ) : null}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {canCorrect && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void correctEnvelope()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            Correct
          </button>
        )}
        {canRemind && (
          <button
            disabled={busy}
            onClick={() => run(`/api/admin/envelopes/${envelopeId}/remind`)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            Send reminder
          </button>
        )}
        {canVoid && (
          <button
            disabled={busy}
            onClick={voidEnvelope}
            className="rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-50"
          >
            Void envelope
          </button>
        )}
        {canDelete && (
          <button
            disabled={busy}
            onClick={deleteAgreement}
            className="rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Delete agreement
          </button>
        )}
      </div>
      {message && <p className="rounded-lg bg-slate-100 p-3 text-sm">{message}</p>}
    </div>
  );
}
