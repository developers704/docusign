import AdminShell from "@/components/AdminShell";
import AgreementsWorkspace from "@/components/AgreementsWorkspace";
import { canDeleteAgreements, getSessionOffice, requireAdmin } from "@/lib/auth";
import type { EnvelopeRecord } from "@/lib/types";
import { readEnvelopes, readOffices } from "@/lib/store";

function filterEnvelopes(envelopes: EnvelopeRecord[], view: string) {
  if (view === "waiting") return envelopes.filter((item) => ["sent", "viewed"].includes(item.status));
  if (view === "scheduled") return envelopes.filter((item) => item.status === "scheduled");
  if (view === "sent") return envelopes.filter((item) => Boolean(item.sentAt));
  if (view === "completed") return envelopes.filter((item) => item.status === "completed");
  if (view === "draft") return envelopes.filter((item) => item.status === "draft");
  if (view === "action") return envelopes.filter((item) => item.status === "draft" || ["sent", "viewed"].includes(item.status));
  if (view === "expiring") {
    const now = Date.now();
    return envelopes.filter(
      (item) =>
        item.expiresAt &&
        !["completed", "voided", "declined"].includes(item.status) &&
        new Date(item.expiresAt).getTime() > now &&
        new Date(item.expiresAt).getTime() - now < 7 * 86_400_000
    );
  }
  return envelopes;
}

function pageTitle(view: string) {
  if (view === "waiting") return "Waiting for others";
  if (view === "scheduled") return "Scheduled";
  if (view === "sent") return "Sent";
  if (view === "completed") return "Completed";
  if (view === "draft") return "Drafts";
  if (view === "action") return "Action required";
  if (view === "expiring") return "Expiring soon";
  return "All agreements";
}

export default async function AgreementsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await requireAdmin();
  const office = await getSessionOffice(session);
  const officeId = session.role === "super_admin" ? undefined : session.officeId;
  const { view = "" } = await searchParams;
  const all = (await readEnvelopes(officeId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const envelopes = filterEnvelopes(all, view);
  const offices = await readOffices();
  const officeNames = Object.fromEntries(offices.map((item) => [item.id, item.name]));
  const canCreate = session.role !== "viewer";
  const canDelete = canDeleteAgreements(session);

  return (
    <AdminShell session={session} office={office}>
      <AgreementsWorkspace
        title={pageTitle(view)}
        envelopes={envelopes}
        officeNames={officeNames}
        showOffice={session.role === "super_admin"}
        canCreate={canCreate}
        canDelete={canDelete}
      />
    </AdminShell>
  );
}
