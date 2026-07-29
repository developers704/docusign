export async function register() {
  // Runs on Node server boot (custom server.js and next start).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduledSendTicker } = await import("@/lib/services/scheduleTicker");
    startScheduledSendTicker();
  }
}
