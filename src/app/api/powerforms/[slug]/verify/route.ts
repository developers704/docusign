import { NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/rateLimit";
import { getPowerFormBySlug } from "@/lib/services/powerFormService";
import { createEmailVerificationChallenge, verifyAccessCode } from "@/lib/services/powerFormAccessService";
import { assertPowerFormAcceptingSubmissions } from "@/lib/services/powerFormValidationService";
import { workflowConfig } from "@/lib/workflowConfig";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const limiter = consumeRateLimit({
    key: `powerform-verify:${slug}:${ip}`,
    windowSeconds: workflowConfig.signingRateLimitWindowSeconds,
    maxRequests: workflowConfig.signingRateLimitMaxRequests,
  });
  if (!limiter.allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait and try again." }, { status: 429 });
  }

  try {
    const body = (await request.json()) as {
      kind?: "access_code" | "email_otp";
      accessCode?: string;
      email?: string;
      submissionId?: string;
    };
    const form = await getPowerFormBySlug(slug);
    if (!form) return NextResponse.json({ error: "PowerForm not found." }, { status: 404 });
    assertPowerFormAcceptingSubmissions(form);

    if (body.kind === "access_code") {
      verifyAccessCode(form, String(body.accessCode || ""));
      return NextResponse.json({ ok: true });
    }

    if (body.kind === "email_otp") {
      const challenge = await createEmailVerificationChallenge({
        form,
        email: String(body.email || ""),
        submissionId: body.submissionId || null,
      });
      return NextResponse.json(challenge);
    }

    return NextResponse.json({ error: "Unsupported verification kind." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to verify." },
      { status: 400 }
    );
  }
}
