import { NextResponse } from "next/server";
import { processDueScheduledSends } from "@/lib/services/scheduledSendRunner";

/**
 * Processes due scheduled agreement sends.
 * Called by server.js every minute; can also be hit manually with CRON_SECRET.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const header = request.headers.get("x-cron-secret") || "";
    const auth = request.headers.get("authorization") || "";
    const ok = header === secret || auth === `Bearer ${secret}`;
    if (!ok) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await processDueScheduledSends();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Scheduled send runner failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scheduler failed." },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
