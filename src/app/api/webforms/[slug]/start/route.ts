import { NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/rateLimit";
import { readWebForms } from "@/lib/store";
import { launchEnvelopeFromPublishedForm } from "@/lib/services/publishedFormService";
import { workflowConfig } from "@/lib/workflowConfig";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const limiter = consumeRateLimit({
    key: `webform:${slug}:${ip}`,
    windowSeconds: workflowConfig.signingRateLimitWindowSeconds,
    maxRequests: workflowConfig.signingRateLimitMaxRequests,
  });
  if (!limiter.allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait and try again." }, { status: 429 });
  }

  try {
    const body = (await request.json()) as { name?: string; email?: string; message?: string };
    const forms = await readWebForms();
    const form = forms.find((item) => item.slug === slug && item.status === "active");
    if (!form) return NextResponse.json({ error: "Web Form not found." }, { status: 404 });

    const { signingToken } = await launchEnvelopeFromPublishedForm({
      kind: "webform",
      form,
      signerName: String(body.name || ""),
      signerEmail: String(body.email || ""),
      message: String(body.message || ""),
      request,
    });

    return NextResponse.json({ signUrl: `/sign/${encodeURIComponent(signingToken)}` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to submit Web Form." }, { status: 400 });
  }
}
