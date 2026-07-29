import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { listNotificationsForSession } from "@/lib/store";

export async function GET() {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const items = await listNotificationsForSession({
    userId: session.userId,
    role: session.role,
    officeId: session.officeId,
    unreadOnly: true,
  });
  const unreadCount = items.length;

  return NextResponse.json({ items, unreadCount });
}
