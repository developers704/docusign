import { notFound } from "next/navigation";
import AdminShell from "@/components/AdminShell";
import PowerFormEditor from "@/components/powerforms/PowerFormEditor";
import { canAccessOffice, getSessionOffice, requireAdmin } from "@/lib/auth";
import { getPowerFormById } from "@/lib/services/powerFormService";
import { readTemplates } from "@/lib/store";
import { templateHasSigningFields } from "@/lib/templateSigningFields";

export default async function EditPowerFormPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  const office = await getSessionOffice(session);
  const { id } = await params;
  const form = await getPowerFormById(id);
  if (!form || !canAccessOffice(session, form.officeId)) notFound();

  const templates = (await readTemplates(session.role === "super_admin" ? undefined : session.officeId || undefined)).filter(
    (item) => item.status === "published" && templateHasSigningFields(item)
  );

  return (
    <AdminShell session={session} office={office}>
      <div className="px-8 py-7">
        <h1 className="text-[28px] font-semibold text-[#21004c]">Edit PowerForm</h1>
        <p className="mt-2 mb-6 text-[14px] text-[#666]">Update intake fields, access, and availability.</p>
        <PowerFormEditor
          templates={templates}
          mode="edit"
          initial={{
            id: form.id,
            name: form.name,
            slug: form.slug,
            description: form.description,
            templateId: form.templateId,
            accessType: form.accessType,
            collectName: form.collectName,
            collectEmail: form.collectEmail,
            collectPhone: form.collectPhone,
            collectEmployeeId: form.collectEmployeeId,
            requireConsent: form.requireConsent,
            consentText: form.consentText,
            successMessage: form.successMessage,
            submissionLimit: form.submissionLimit,
            customIntakeFields: form.customIntakeFields,
            status: form.status,
          }}
        />
      </div>
    </AdminShell>
  );
}
