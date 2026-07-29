"use client";

import { useEffect, useState } from "react";
import { detectBrowserTimeZone, formatInTimeZone, formatScheduleDisplay } from "@/lib/timezone";

/** Renders an ISO timestamp in the viewer's browser timezone (not the server's). */
export default function LocalDateTime({
  value,
  mode = "datetime",
  timeZone: forcedZone,
  className,
}: {
  value: string | null | undefined;
  mode?: "datetime" | "schedule";
  /** If set, format in this zone; otherwise use browser zone. */
  timeZone?: string | null;
  className?: string;
}) {
  const [text, setText] = useState("");

  useEffect(() => {
    if (!value) {
      setText("");
      return;
    }
    const zone = forcedZone || detectBrowserTimeZone();
    setText(mode === "schedule" ? formatScheduleDisplay(value, zone) : formatInTimeZone(value, zone));
  }, [value, mode, forcedZone]);

  if (!value) return <span className={className}>—</span>;
  return <span className={className}>{text || "…"}</span>;
}
