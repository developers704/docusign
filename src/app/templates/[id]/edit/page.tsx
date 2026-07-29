import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import AdminShell from "@/components/AdminShell";
import CreateTemplateForm from "@/components/templates/CreateTemplateForm";
import { canAccessOffice, getSessionOffice, requireAdmin } from "@/lib/auth";
import { readOffices } from "@/lib/store";
import { parseTemplateFormData } from "@/lib/templateFormActions";
import { createTemplateService } from "@/lib/services/templateService";

const service = createTemplateService();

async function updateTemplateAction(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  if (session.role === "viewer") return;
  const templateId = String(formData.get("templateId") || "");
  const template = await service.getById(templateId);
  if (!template || !canAccessOffice(session, template.officeId)) return;

  const parsed = parseTemplateFormData(formData);
  await service.updateTemplate({
    actor: { userId: session.userId, email: session.email, role: session.role },
    template,
    name: parsed.name,
    title: parsed.title,
    description: parsed.description,
    message: parsed.message,
    content: parsed.content,
    category: parsed.category,
    tags: parsed.tags,
    roleNames: parsed.roleNames,
    roleDrafts: parsed.roleDrafts,
    internalNotes: parsed.internalNotes,
  });

  const removeIds = formData.getAll("removeDocumentIds").map(String).filter(Boolean);
  if (template.currentVersionId) {
    for (const documentId of removeIds) {
      await service.documentService.removeDocument({
        versionId: template.currentVersionId,
        documentId,
      });
    }
    const documentFiles = formData
      .getAll("documentFiles")
      .filter((item): item is File => item instanceof File && item.size > 0);
    if (documentFiles.length) {
      await service.documentService.uploadMany({
        templateId: template.id,
        versionId: template.currentVersionId,
        officeId: template.officeId,
        files: documentFiles,
        mode: "append",
      });
    }
  }

  revalidatePath("/templates");
  revalidatePath(`/templates/${template.id}/edit`);
  redirect(`/templates/${template.id}/edit`);
}

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireAdmin();
  if (session.role === "viewer") redirect("/templates");

  const template = await service.getById(id);
  if (!template || !canAccessOffice(session, template.officeId)) notFound();

  const office = await getSessionOffice(session);
  const offices = session.role === "super_admin" ? await readOffices() : office ? [office] : [];
  const activeOffices = offices.filter((item) => item.isActive);

  return (
    <AdminShell session={session} office={office}>
      <CreateTemplateForm
        template={template}
        updateAction={updateTemplateAction}
        allowOfficeSelection={false}
        offices={activeOffices}
        defaultOfficeId={template.officeId}
      />
    </AdminShell>
  );
}
