import { redirect } from "next/navigation";
import Link from "next/link";
import AdminShell from "@/components/AdminShell";
import type { EnvelopeRecord } from "@/lib/types";
import HistoryBackButton from "@/components/HistoryBackButton";
import NewEnvelopeForm from "@/components/NewEnvelopeForm";
import { canAccessOffice, canCreateEnvelopes, getSessionOffice, requireAdmin } from "@/lib/auth";
import { featureFlags } from "@/lib/featureFlags";
import { readCategories } from "@/lib/categories";
import { getEnvelopeById, readOffices } from "@/lib/store";
import { createTemplateService } from "@/lib/services/templateService";

export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; bulk?: string; draft?: string }>;
}) {
  const { template: initialTemplateId, bulk, draft: draftId } = await searchParams;
  const templateService = createTemplateService();
  const session = await requireAdmin();
  if (!canCreateEnvelopes(session)) redirect("/");
  const office = await getSessionOffice(session);
  const offices = session.role === "super_admin" ? await readOffices(true) : office ? [office] : [];
  if (offices.length === 0) redirect(session.role === "super_admin" ? "/offices" : "/");
  const defaultOfficeId = session.officeId || offices[0]?.id || "";
  let templates = featureFlags.phase1TemplateFoundation
    ? await templateService.listAvailableForEnvelopeCreation(session.role === "super_admin" ? undefined : session.officeId || undefined)
    : await templateService.list({ officeId: session.role === "super_admin" ? undefined : session.officeId || undefined, includeGlobal: true });

  let initialTemplate = initialTemplateId
    ? templates.find((item) => item.id === initialTemplateId)
    : undefined;
  if (initialTemplateId && !initialTemplate) {
    const byId = await templateService.getById(initialTemplateId);
    if (byId && (byId.status === "published" || byId.status === "draft")) {
      initialTemplate = byId;
      if (!templates.some((item) => item.id === byId.id)) {
        templates = [byId, ...templates];
      }
    }
  }

  const categories = await readCategories();

  let editEnvelope: EnvelopeRecord | null = null;
  if (draftId) {
    const envelope = await getEnvelopeById(draftId);
    if (!envelope || !canAccessOffice(session, envelope.officeId) || envelope.status !== "draft") {
      redirect("/agreements");
    }
    editEnvelope = envelope;
  }

  return (
    <AdminShell session={session} office={office}>
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-[#e8e8e8] pb-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#4c00ff]">
              {editEnvelope ? "Step 1 of 3 · Recipients" : bulk === "1" ? "Bulk send" : "Step 1 of 3 · Upload & recipients"}
            </p>
            <h1 className="text-[20px] font-semibold text-[#212121]">
              {editEnvelope
                ? "Edit recipients, emails & message"
                : bulk === "1"
                  ? "Bulk send"
                  : "Upload a Document and Add Contract Recipients"}
            </h1>
          </div>
          {bulk === "1" && !editEnvelope ? (
            <HistoryBackButton
              fallbackHref="/"
              className="shrink-0 rounded-[2px] border border-[#c6c6c6] bg-white px-4 py-2 text-[14px] font-semibold text-[#333] hover:bg-[#f7f7f7]"
            />
          ) : null}
        </div>
        {bulk === "1" && (
          <div className="mb-5 rounded border border-[#e0e0e0] bg-white p-5">
            <h2 className="text-lg font-semibold text-[#212121]">Bulk send</h2>
            <p className="mt-1 text-sm text-[#666]">
              Same document for everyone — each person gets a <strong>separate contract</strong> in Contracts (with
              their name), and their own certificate after they sign.
            </p>
            <p className="mt-3">
              <Link href="/documents/new" className="text-[14px] font-semibold text-[#4c00ff] hover:underline">
                Exit bulk — use regular send
              </Link>
            </p>
          </div>
        )}
        <div className="rounded border border-[#e8e8e8] bg-white p-5 sm:p-7">
          <NewEnvelopeForm
            templates={templates}
            offices={offices}
            defaultOfficeId={defaultOfficeId}
            allowOfficeSelection={session.role === "super_admin"}
            initialTemplate={initialTemplate}
            initialCategories={categories}
            bulkMode={bulk === "1"}
            editEnvelope={editEnvelope || undefined}
          />
        </div>
      </div>
    </AdminShell>
  );
}
