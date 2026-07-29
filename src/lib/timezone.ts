/** IANA timezone helpers for schedule send (browser-local by default). */

export type TimeZoneOption = {
  id: string;
  label: string;
  region: string;
};

/** Common business zones — user can still use their detected zone even if not listed. */
export const COMMON_TIME_ZONES: TimeZoneOption[] = [
  { id: "America/Los_Angeles", label: "Pacific Time (US & Canada)", region: "Americas" },
  { id: "America/Denver", label: "Mountain Time (US & Canada)", region: "Americas" },
  { id: "America/Chicago", label: "Central Time (US & Canada)", region: "Americas" },
  { id: "America/New_York", label: "Eastern Time (US & Canada)", region: "Americas" },
  { id: "America/Toronto", label: "Eastern Time — Toronto", region: "Americas" },
  { id: "America/Vancouver", label: "Pacific Time — Vancouver", region: "Americas" },
  { id: "America/Sao_Paulo", label: "Brasilia Time", region: "Americas" },
  { id: "Europe/London", label: "UK — London", region: "Europe" },
  { id: "Europe/Paris", label: "Central European Time", region: "Europe" },
  { id: "Europe/Berlin", label: "Central European Time — Berlin", region: "Europe" },
  { id: "Asia/Dubai", label: "Gulf Standard Time — Dubai", region: "Middle East" },
  { id: "Asia/Karachi", label: "Pakistan Standard Time", region: "Asia" },
  { id: "Asia/Kolkata", label: "India Standard Time", region: "Asia" },
  { id: "Asia/Singapore", label: "Singapore Time", region: "Asia" },
  { id: "Asia/Tokyo", label: "Japan Standard Time", region: "Asia" },
  { id: "Australia/Sydney", label: "Australian Eastern Time", region: "Pacific" },
  { id: "Pacific/Auckland", label: "New Zealand Time", region: "Pacific" },
  { id: "UTC", label: "UTC (Coordinated Universal Time)", region: "UTC" },
];

export function detectBrowserTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone && typeof zone === "string" && isValidTimeZone(zone)) return zone;
  } catch {
    // ignore
  }
  return "UTC";
}

export function isValidTimeZone(timeZone: string | null | undefined): boolean {
  const zone = timeZone?.trim();
  if (!zone) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: zone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/** Returns a safe IANA zone (falls back to UTC). */
export function safeTimeZone(timeZone: string | null | undefined): string {
  const zone = timeZone?.trim();
  if (zone && isValidTimeZone(zone)) return zone;
  return "UTC";
}

/**
 * Browser `Date#getTimezoneOffset()` → IANA Etc/GMT zone.
 * Note: Etc/GMT signs are inverted (UTC+5 → Etc/GMT-5).
 */
export function timeZoneFromOffsetMinutes(offsetMinutes: number): string {
  if (!Number.isFinite(offsetMinutes)) return "UTC";
  const hours = Math.round(-offsetMinutes / 60);
  if (hours === 0) return "UTC";
  return hours > 0 ? `Etc/GMT-${hours}` : `Etc/GMT+${Math.abs(hours)}`;
}

/** Resolve signer zone without forcing UTC when offset is known. */
export function resolveSignerTimeZone(input: {
  timeZone?: string | null;
  timezoneOffsetMinutes?: number | null;
}): string | null {
  const named = input.timeZone?.trim();
  if (named && isValidTimeZone(named)) return named;
  if (typeof input.timezoneOffsetMinutes === "number" && Number.isFinite(input.timezoneOffsetMinutes)) {
    const fromOffset = timeZoneFromOffsetMinutes(input.timezoneOffsetMinutes);
    if (isValidTimeZone(fromOffset)) return fromOffset;
  }
  return null;
}

/** Format an instant using the browser's getTimezoneOffset() (no IANA needed). */
export function formatWithUtcOffset(isoOrDate: string | Date, timezoneOffsetMinutes: number): string {
  const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (!Number.isFinite(date.getTime())) return "Not recorded";
  const localMs = date.getTime() - timezoneOffsetMinutes * 60_000;
  const wall = new Date(localMs);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[wall.getUTCMonth()];
  const day = wall.getUTCDate();
  const year = wall.getUTCFullYear();
  let hour = wall.getUTCHours();
  const minute = String(wall.getUTCMinutes()).padStart(2, "0");
  const second = String(wall.getUTCSeconds()).padStart(2, "0");
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  const offsetHours = Math.round(-timezoneOffsetMinutes / 60);
  const gmt =
    offsetHours === 0 ? "UTC" : offsetHours > 0 ? `GMT+${offsetHours}` : `GMT${offsetHours}`;
  return `${month} ${day}, ${year}, ${hour}:${minute}:${second} ${ampm} ${gmt}`;
}

/** Prefer the exact local string from the signer device; otherwise zone/offset formatting. */
export function formatSignerLocalDate(input: {
  value: string | null | undefined;
  localDisplay?: string | null;
  timeZone?: string | null;
  timezoneOffsetMinutes?: number | null;
}): string {
  const display = input.localDisplay?.trim();
  if (display) return display;
  if (!input.value) return "Not recorded";
  const zone = resolveSignerTimeZone({
    timeZone: input.timeZone,
    timezoneOffsetMinutes: input.timezoneOffsetMinutes,
  });
  if (zone) {
    try {
      return new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "long",
        timeZone: zone,
      }).format(new Date(input.value));
    } catch {
      // fall through
    }
  }
  if (typeof input.timezoneOffsetMinutes === "number" && Number.isFinite(input.timezoneOffsetMinutes)) {
    return formatWithUtcOffset(input.value, input.timezoneOffsetMinutes);
  }
  return formatWithUtcOffset(input.value, 0);
}

export function timeZoneLabel(timeZone: string): string {
  const known = COMMON_TIME_ZONES.find((item) => item.id === timeZone);
  if (known) return known.label;
  return timeZone.replaceAll("_", " ");
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value || "0");

  let hour = read("hour");
  // Some engines still emit 24 for midnight with hourCycle h23.
  if (hour === 24) hour = 0;

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour,
    minute: read("minute"),
    second: read("second"),
  };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** Format an instant as YYYY-MM-DDTHH:mm for datetime-local, in a given IANA zone. */
export function toDateTimeLocalValue(isoOrDate: string | Date | null | undefined, timeZone: string): string {
  if (!isoOrDate) return "";
  const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (!Number.isFinite(date.getTime())) return "";
  try {
    const p = getZonedParts(date, safeTimeZone(timeZone));
    return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
  } catch {
    return "";
  }
}

/**
 * Convert wall-clock datetime-local (YYYY-MM-DDTHH:mm) in an IANA zone → UTC ISO.
 * Uses iterative offset correction (no external timezone library).
 */
export function wallTimeInZoneToUtcIso(wall: string, timeZone: string): string | null {
  const match = wall.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] || "0");
  if ([year, month, day, hour, minute, second].some((n) => !Number.isFinite(n))) return null;

  const zone = safeTimeZone(timeZone);
  const desiredAsUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  let utcMs = desiredAsUtcMs;

  try {
    for (let i = 0; i < 4; i += 1) {
      const shown = getZonedParts(new Date(utcMs), zone);
      const shownAsUtcMs = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute, shown.second);
      const diff = desiredAsUtcMs - shownAsUtcMs;
      utcMs += diff;
      if (diff === 0) break;
    }
  } catch {
    return null;
  }

  const result = new Date(utcMs);
  if (!Number.isFinite(result.getTime())) return null;
  return result.toISOString();
}

export function formatInTimeZone(
  isoOrDate: string | Date | null | undefined,
  timeZone: string,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!isoOrDate) return "";
  const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (!Number.isFinite(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: safeTimeZone(timeZone),
      dateStyle: "medium",
      timeStyle: "short",
      ...options,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

/** e.g. "Jul 25, 2026, 3:00 PM PDT · Pacific Time (US & Canada)" */
export function formatScheduleDisplay(
  isoOrDate: string | Date | null | undefined,
  timeZone: string
): string {
  if (!isoOrDate) return "";
  const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (!Number.isFinite(date.getTime())) return "";
  const zone = safeTimeZone(timeZone);

  try {
    const formatted = new Intl.DateTimeFormat(undefined, {
      timeZone: zone,
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date);
    return `${formatted} · ${timeZoneLabel(zone)}`;
  } catch {
    return date.toISOString();
  }
}

export function formatLiveClock(timeZone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: safeTimeZone(timeZone),
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    }).format(now);
  } catch {
    return now.toISOString();
  }
}

export function buildTimeZoneSelectOptions(preferredZone: string): TimeZoneOption[] {
  const list = [...COMMON_TIME_ZONES];
  if (preferredZone && !list.some((item) => item.id === preferredZone)) {
    list.unshift({
      id: preferredZone,
      label: `${preferredZone.replaceAll("_", " ")} (detected)`,
      region: "Detected",
    });
  }
  return list;
}
