import { notFound } from "next/navigation";
import AdminShell from "@/components/AdminShell";
import PowerFormManagePanel from "@/components/powerforms/PowerFormManagePanel";
import { canAccessOffice, getSessionOffice, requireAdmin } from "@/lib/auth";
import { getPowerFormById } from "@/lib/services/powerFormService";
import { listSubmissionsForPowerForm } from "@/lib/services/powerFormSubmissionService";
import { readTemplates } from "@/lib/store";

export default async function ManagePowerFormPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  const office = await getSessionOffice(session);
  const { id } = await params;
  const form = await getPowerFormById(id);
  if (!form || !canAccessOffice(session, form.officeId)) notFound();
  const submissions = await listSubmissionsForPowerForm(form.id);
  const templates = await readTemplates();
  const template = templates.find((item) => item.id === form.templateId);
  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

  return (
    <AdminShell session={session} office={office}>
      <div className="px-8 py-7">
        <PowerFormManagePanel
          form={form}
          submissions={submissions}
          templateName={template?.name || form.templateId}
          templateVersionId={form.templateVersionId}
          currentTemplateVersionId={template?.currentVersionId || null}
          appUrl={appUrl}
        />
      </div>
    </AdminShell>
  );
}
