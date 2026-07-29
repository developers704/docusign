import AdminShell from "@/components/AdminShell";
import ReportsDashboard from "@/components/ReportsDashboard";
import { getSessionOffice, requireAdmin } from "@/lib/auth";
import { readAuditEvents, readEnvelopes } from "@/lib/store";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view = "" } = await searchParams;
  const session = await requireAdmin();
  const office = await getSessionOffice(session);
  const officeId = session.role === "super_admin" ? undefined : session.officeId;
  const envelopes = await readEnvelopes(officeId);
  const events = (await readAuditEvents(undefined, officeId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const title =
    view === "audit"
      ? "Audit events"
      : view === "recipients"
        ? "Recipient activity"
        : view === "envelopes"
          ? "Envelope usage"
          : "Administrator dashboard";

  return (
    <AdminShell session={session} office={office}>
      <ReportsDashboard title={title} view={view} envelopes={envelopes} events={events} />
    </AdminShell>
  );
}
