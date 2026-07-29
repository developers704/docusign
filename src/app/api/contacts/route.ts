import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { readEnvelopes } from "@/lib/store";

export async function GET() {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const envelopes = await readEnvelopes(session.role === "super_admin" ? undefined : session.officeId);
  const map = new Map<string, { name: string; email: string; agreements: number; last: string }>();

  for (const envelope of envelopes) {
    for (const recipient of envelope.recipients) {
      const email = String(recipient.email || "").trim();
      const name = String(recipient.name || "").trim();
      if (!email || !name) continue;
      const key = email.toLowerCase();
      const current = map.get(key);
      map.set(key, {
        name,
        email,
        agreements: (current?.agreements || 0) + 1,
        last: current && current.last > envelope.updatedAt ? current.last : envelope.updatedAt,
      });
    }
  }

  const items = [...map.values()].sort((a, b) => b.last.localeCompare(a.last)).slice(0, 200);
  return NextResponse.json({ items });
}
