import { redirect } from "next/navigation";
import { canAccessOffice, requireAdmin } from "@/lib/auth";
import { getEnvelopeById } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Safe landing for notification links: open the agreement when it still exists,
 * otherwise fall back to the agreements list (avoids bare Next.js 404).
 */
export default async function OpenEnvelopePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  const { id } = await params;
  const envelope = await getEnvelopeById(id);
  if (envelope && canAccessOffice(session, envelope.officeId)) {
    redirect(`/envelopes/${envelope.id}`);
  }
  redirect(`/agreements?missing=${encodeURIComponent(id)}`);
}
