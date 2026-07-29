import { NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/rateLimit";
import {
  completeEmailVerifiedStart,
  startPowerFormSubmission,
} from "@/lib/services/powerFormSubmissionService";
import { workflowConfig } from "@/lib/workflowConfig";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const limiter = consumeRateLimit({
    key: `powerform:${slug}:${ip}`,
    windowSeconds: workflowConfig.signingRateLimitWindowSeconds,
    maxRequests: workflowConfig.signingRateLimitMaxRequests,
  });
  if (!limiter.allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait and try again." }, { status: 429 });
  }

  try {
    const body = (await request.json()) as {
      name?: string;
      email?: string;
      phone?: string;
      employeeId?: string;
      accessCode?: string;
      consentAccepted?: boolean;
      emailChallengeId?: string;
      emailVerificationCode?: string;
      intake?: Record<string, string>;
      submissionId?: string;
      challengeId?: string;
      code?: string;
      completeVerification?: boolean;
    };

    if (body.completeVerification && body.submissionId && body.challengeId && body.code) {
      const result = await completeEmailVerifiedStart({
        slug,
        submissionId: body.submissionId,
        challengeId: body.challengeId,
        code: body.code,
        request,
      });
      return NextResponse.json(result);
    }

    const intake: Record<string, string> = {
      ...(body.intake || {}),
      name: String(body.name || body.intake?.name || ""),
      email: String(body.email || body.intake?.email || ""),
      phone: String(body.phone || body.intake?.phone || ""),
      employeeId: String(body.employeeId || body.intake?.employeeId || ""),
    };

    const result = await startPowerFormSubmission({
      slug,
      intake,
      accessCode: body.accessCode,
      consentAccepted: body.consentAccepted,
      emailChallengeId: body.emailChallengeId,
      emailVerificationCode: body.emailVerificationCode,
      request,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to start PowerForm." },
      { status: 400 }
    );
  }
}
