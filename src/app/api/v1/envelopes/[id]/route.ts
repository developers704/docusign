import { NextResponse } from "next/server";
import { findIntegrationsByApiKey } from "@/lib/integrationsStore";
import { getEnvelopeById } from "@/lib/store";

function extractBearer(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiKey = extractBearer(request);
  if (!apiKey) return NextResponse.json({ error: "Missing Bearer API key." }, { status: 401 });
  const integrations = await findIntegrationsByApiKey(apiKey);
  if (!integrations?.restApi?.enabled) {
    return NextResponse.json({ error: "Invalid or disabled API key." }, { status: 401 });
  }
  const { id } = await params;
  const officeId = integrations.scopeId === "__network__" ? null : integrations.scopeId;
  const envelope = await getEnvelopeById(id, officeId);
  if (!envelope) return NextResponse.json({ error: "Envelope not found." }, { status: 404 });
  return NextResponse.json({
    id: envelope.id,
    envelopeNumber: envelope.envelopeNumber,
    title: envelope.title,
    status: envelope.status,
    officeId: envelope.officeId,
    officeName: envelope.officeName,
    createdAt: envelope.createdAt,
    sentAt: envelope.sentAt,
    completedAt: envelope.completedAt,
    recipients: envelope.recipients.map((recipient) => ({
      id: recipient.id,
      name: recipient.name,
      email: recipient.email,
      status: recipient.status,
      order: recipient.order,
      signedAt: recipient.signedAt,
    })),
  });
}
