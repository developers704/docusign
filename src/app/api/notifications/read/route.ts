import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { markNotificationsRead } from "@/lib/store";

export async function POST(request: Request) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { ids?: string[] | "all" };
  const ids = body.ids === "all" ? "all" : Array.isArray(body.ids) ? body.ids : "all";

  await markNotificationsRead({
    userId: session.userId,
    role: session.role,
    officeId: session.officeId,
    ids,
  });

  return NextResponse.json({ ok: true });
}
