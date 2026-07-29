import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { addCategory, readCategories } from "@/lib/categories";

export async function GET() {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const items = await readCategories();
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const session = await requireAdminApi();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = (await request.json()) as { name?: string };
  try {
    const items = await addCategory(String(body.name || ""));
    return NextResponse.json({ items, added: String(body.name || "").trim() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not add category." }, { status: 400 });
  }
}
