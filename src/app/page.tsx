import AdminShell from "@/components/AdminShell";
import HomeDashboard from "@/components/HomeDashboard";
import { getSessionOffice, requireAdmin } from "@/lib/auth";
import { readEnvelopes } from "@/lib/store";
import { agreementSigningProgress } from "@/lib/agreementProgress";

export default async function DashboardPage() {
  const session = await requireAdmin();
  const office = await getSessionOffice(session);
  const officeId = session.role === "super_admin" ? undefined : session.officeId;
  const envelopes = (await readEnvelopes(officeId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const canCreate = session.role !== "viewer";
  const sixMonthsAgo = Date.now() - 182 * 86_400_000;
  const recent = envelopes.filter((item) => new Date(item.updatedAt).getTime() >= sixMonthsAgo);

  const actionRequired = recent.filter((item) => {
    if (item.status === "draft") return true;
    return item.recipients.some(
      (recipient) =>
        recipient.email.toLowerCase() === session.email.toLowerCase() &&
        ["sent", "viewed", "active"].includes(recipient.status)
    );
  }).length;

  const waitingForOthers = recent.filter((item) => {
    if (!["sent", "viewed"].includes(item.status)) return false;
    const isMyTurn = item.recipients.some(
      (recipient) =>
        recipient.email.toLowerCase() === session.email.toLowerCase() &&
        ["sent", "viewed", "active"].includes(recipient.status)
    );
    return !isMyTurn;
  }).length;

  const completed = recent.filter((item) => item.status === "completed").length;
  const expiringSoon = recent.filter(
    (item) =>
      item.expiresAt &&
      !["completed", "voided", "declined"].includes(item.status) &&
      new Date(item.expiresAt).getTime() - Date.now() < 7 * 86_400_000 &&
      new Date(item.expiresAt).getTime() > Date.now()
  ).length;

  const activity = envelopes.slice(0, 10).map((envelope) => {
    const progress = agreementSigningProgress(envelope);
    return {
      id: envelope.id,
      title: envelope.title,
      status: envelope.status,
      updatedAt: envelope.updatedAt,
      waitingForName: progress.waitingForName,
      stageLabel: progress.stageLabel,
      summaryLabel: progress.summaryLabel,
      progressPercent: progress.percent,
      waitingCount: progress.waitingCount,
      recipients: progress.recipients,
      canCorrect: progress.canCorrect,
      canDownload: envelope.status === "completed" && Boolean(envelope.signedPdfPath),
      isDraft: envelope.status === "draft",
    };
  });

  return (
    <AdminShell session={session} office={office}>
      <HomeDashboard
        userName={session.name}
        userEmail={session.email}
        canCreate={canCreate}
        stats={{
          actionRequired,
          waitingForOthers,
          expiringSoon,
          completed,
        }}
        activity={activity}
      />
    </AdminShell>
  );
}
