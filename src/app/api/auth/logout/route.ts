import { NextResponse } from "next/server";
import { sessionCookieName } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Use a relative Location so the browser resolves /login against the public
 * domain the user is already on. Absolute redirects from request.url break on
 * cPanel/Passenger because the internal URL is often https://0.0.0.0:PORT.
 */
export async function POST() {
  const response = new NextResponse(null, {
    status: 303,
    headers: {
      Location: "/login",
      "Cache-Control": "no-store",
    },
  });
  response.cookies.set(sessionCookieName, "", {
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
  });
  return response;
}

export async function GET() {
  return POST();
}
