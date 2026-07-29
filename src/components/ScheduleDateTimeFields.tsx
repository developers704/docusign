"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildTimeZoneSelectOptions,
  detectBrowserTimeZone,
  formatLiveClock,
  formatScheduleDisplay,
  timeZoneLabel,
  toDateTimeLocalValue,
  wallTimeInZoneToUtcIso,
} from "@/lib/timezone";

type Props = {
  value: string;
  onChange: (wallValue: string) => void;
  timeZone: string;
  onTimeZoneChange: (zone: string) => void;
  /** Existing scheduled ISO (UTC) for preview line */
  scheduledIso?: string | null;
  className?: string;
  inputClassName?: string;
};

/** Ensure datetime-local is never in the past; when a new date is picked, auto-fill a valid time. */
function snapScheduleWallTime(next: string, previous: string, timeZone: string): string {
  if (!next) return next;
  const minWall = toDateTimeLocalValue(new Date(Date.now() + 60_000), timeZone);
  if (!minWall) return next;

  const nextDate = next.slice(0, 10);
  const prevDate = previous.slice(0, 10);
  const minDate = minWall.slice(0, 10);
  const dateChanged = Boolean(nextDate && nextDate !== prevDate);

  // User picked a different calendar day → auto choose a sensible time for that day.
  if (dateChanged) {
    if (nextDate > minDate) {
      return `${nextDate}T09:00`;
    }
    if (nextDate === minDate) {
      return minWall;
    }
    // Past day → jump to earliest valid (now + 1 min).
    return minWall;
  }

  const iso = wallTimeInZoneToUtcIso(next, timeZone);
  if (!iso || new Date(iso).getTime() < Date.now() + 60_000) {
    return minWall;
  }
  return next;
}

export default function ScheduleDateTimeFields({
  value,
  onChange,
  timeZone,
  onTimeZoneChange,
  scheduledIso = null,
  className = "",
  inputClassName = "",
}: Props) {
  const [now, setNow] = useState(() => new Date());
  const options = useMemo(() => buildTimeZoneSelectOptions(timeZone), [timeZone]);
  const minLocal = useMemo(
    () => toDateTimeLocalValue(new Date(now.getTime() + 60_000), timeZone),
    [timeZone, now]
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Keep selected value valid as the clock ticks (avoid stale past times).
  useEffect(() => {
    if (!value || !minLocal) return;
    const iso = wallTimeInZoneToUtcIso(value, timeZone);
    if (!iso || new Date(iso).getTime() < Date.now() + 60_000) {
      onChange(minLocal);
    }
  }, [minLocal, value, timeZone, onChange]);

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="rounded-lg border border-[#e7e2ec] bg-[#f0ebff]/80 px-3 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#4c00ff]">Your local live time</p>
        <p className="mt-0.5 text-sm font-bold text-[#21004c]">{formatLiveClock(timeZone, now)}</p>
        <p className="mt-0.5 text-[11px] text-[#21004c]/80">
          {timeZoneLabel(timeZone)} · {timeZone}
        </p>
      </div>

      <label className="block text-xs font-semibold text-slate-600">
        Time zone
        <select
          value={timeZone}
          onChange={(event) => onTimeZoneChange(event.target.value)}
          className={`mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#4c00ff] ${inputClassName}`}
        >
          {options.map((item) => (
            <option key={item.id} value={item.id}>
              {item.region}: {item.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs font-semibold text-slate-600">
        Schedule date & time
        <input
          type="datetime-local"
          min={minLocal}
          value={value}
          onChange={(event) => onChange(snapScheduleWallTime(event.target.value, value, timeZone))}
          className={`mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#4c00ff] ${inputClassName}`}
        />
      </label>

      {value ? (
        <p className="text-xs text-slate-600">
          Will send at{" "}
          <span className="font-semibold text-slate-900">
            {(() => {
              const iso = wallTimeInZoneToUtcIso(value, timeZone);
              return iso ? formatScheduleDisplay(iso, timeZone) : "—";
            })()}
          </span>
        </p>
      ) : null}

      {scheduledIso ? (
        <p className="text-xs font-medium text-[#4c00ff]">
          Currently scheduled: {formatScheduleDisplay(scheduledIso, timeZone)}
        </p>
      ) : null}
    </div>
  );
}

export function useDetectedTimeZone(initial?: string | null) {
  const [timeZone, setTimeZone] = useState(initial || "UTC");

  useEffect(() => {
    if (initial) {
      setTimeZone(initial);
      return;
    }
    setTimeZone(detectBrowserTimeZone());
  }, [initial]);

  return [timeZone, setTimeZone] as const;
}
