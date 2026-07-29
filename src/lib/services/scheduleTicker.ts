import { processDueScheduledSends } from "@/lib/services/scheduledSendRunner";

const TICK_MS = 60_000;
let started = false;
let timer: ReturnType<typeof setInterval> | null = null;

/** In-process scheduler (more reliable than HTTP self-calls on some hosts). */
export function startScheduledSendTicker() {
  if (started || typeof setInterval !== "function") return;
  started = true;

  const tick = () => {
    void processDueScheduledSends()
      .then((result) => {
        if (result.processed || result.failed) {
          console.log(
            `[scheduler] processed=${result.processed} failed=${result.failed}`
          );
        }
      })
      .catch((error) => {
        console.error("[scheduler] tick failed:", error);
      });
  };

  // First check shortly after boot, then every minute.
  setTimeout(tick, 12_000);
  timer = setInterval(tick, TICK_MS);
  if (typeof timer === "object" && timer && "unref" in timer) {
    try {
      (timer as NodeJS.Timeout).unref?.();
    } catch {
      // ignore
    }
  }
}
