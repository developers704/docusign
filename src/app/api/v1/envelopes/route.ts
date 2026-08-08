import { NextResponse } from "next/server";
import { findIntegrationsByApiKey } from "@/lib/integrationsStore";
import { getEnvelopeById, readEnvelopes } from "@/lib/store";

function extractBearer(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

async function requireApiIntegrations(request: Request) {
  const apiKey = extractBearer(request);
  if (!apiKey) return { error: NextResponse.json({ error: "Missing Bearer API key." }, { status: 401 }) };
  const integrations = await findIntegrationsByApiKey(apiKey);
  if (!integrations?.restApi?.enabled) {
    return { error: NextResponse.json({ error: "Invalid or disabled API key." }, { status: 401 }) };
  }
  const officeId = integrations.scopeId === "__network__" ? null : integrations.scopeId;
  return { integrations, officeId };
}

export async function GET(request: Request) {
  const auth = await requireApiIntegrations(request);
  if ("error" in auth && auth.error) return auth.error;

  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim();
  if (id) {
    const envelope = await getEnvelopeById(id, auth.officeId);
    if (!envelope) return NextResponse.json({ error: "Envelope not found." }, { status: 404 });
    return NextResponse.json({
      id: envelope.id,
      envelopeNumber: envelope.envelopeNumber,
      title: envelope.title,
      status: envelope.status,
      officeId: envelope.officeId,
      officeName: envelope.officeName,
      createdAt: envelope.createdAt,
      completedAt: envelope.completedAt,
      recipients: envelope.recipients.map((recipient) => ({
        id: recipient.id,
        name: recipient.name,
        email: recipient.email,
        status: recipient.status,
        order: recipient.order,
      })),
    });
  }

  const envelopes = await readEnvelopes(auth.officeId);
  return NextResponse.json({
    scope: auth.officeId || "network",
    count: envelopes.length,
    envelopes: envelopes.slice(0, 100).map((envelope) => ({
      id: envelope.id,
      envelopeNumber: envelope.envelopeNumber,
      title: envelope.title,
      status: envelope.status,
      officeId: envelope.officeId,
      createdAt: envelope.createdAt,
      completedAt: envelope.completedAt,
    })),
  });
}
