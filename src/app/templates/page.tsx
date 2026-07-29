import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import AdminShell from "@/components/AdminShell";
import TemplatesWorkspace from "@/components/templates/TemplatesWorkspace";
import { canAccessOffice, getSessionOffice, requireAdmin } from "@/lib/auth";
import {
  readOffices,
  readPowerForms,
  readTemplateFolders,
  readTemplates,
  writeTemplateFolders,
  writeTemplates,
} from "@/lib/store";
import { parseTemplateFormData } from "@/lib/templateFormActions";
import { createPowerFormFromTemplate, createWebFormFromTemplate } from "@/lib/services/publishedFormService";
import { createTemplateService } from "@/lib/services/templateService";
import type { TemplateFolderRecord, TemplateRecord } from "@/lib/types";

const service = createTemplateService();

async function createTemplateAction(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  if (session.role === "viewer") return;
  const parsed = parseTemplateFormData(formData);
  const officeId = String(formData.get("officeId") || session.officeId || "").trim();
  if (!officeId || !canAccessOffice(session, officeId)) return;

  const documentFiles = formData
    .getAll("documentFiles")
    .filter((item): item is File => item instanceof File && item.size > 0);

  const created = await service.createTemplate({
    actor: { userId: session.userId, email: session.email, role: session.role },
    officeId,
    name: parsed.name,
    title: parsed.title,
    description: parsed.description,
    message: parsed.message,
    content: parsed.content,
    category: parsed.category,
    tags: parsed.tags,
    visibility: parsed.visibility,
    selectedOfficeIds: parsed.selectedOfficeIds,
    selectedGroupIds: parsed.selectedGroupIds,
    roleNames: parsed.roleNames,
    roleDrafts: parsed.roleDrafts,
    sourceType: documentFiles.length ? "uploaded_pdf" : "policy_text",
    expiryDays: 0,
    internalNotes: parsed.internalNotes,
  });

  if (documentFiles.length && created.currentVersionId) {
    await service.documentService.uploadMany({
      templateId: created.id,
      versionId: created.currentVersionId,
      officeId: created.officeId,
      files: documentFiles,
      mode: "replace",
    });
  }

  const assignFolderId = String(formData.get("folderId") || "").trim();
  if (assignFolderId) {
    const all = await readTemplates();
    const row = all.find((item) => item.id === created.id);
    if (row) {
      row.folderIds = [assignFolderId];
      row.updatedAt = new Date().toISOString();
      await writeTemplates(all);
    }
    revalidatePath("/templates");
    redirect(`/templates?folder=${encodeURIComponent(assignFolderId)}`);
  }

  revalidatePath("/templates");
  revalidatePath(`/templates/${created.id}/edit`);
  redirect(`/templates/${created.id}/edit`);
}

async function duplicateTemplateAction(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  if (session.role === "viewer") return;
  const templateId = String(formData.get("templateId") || "");
  const template = await service.getById(templateId);
  if (!template || !canAccessOffice(session, template.officeId)) return;
  await service.duplicateTemplate({ actor: { userId: session.userId, email: session.email }, template });
  revalidatePath("/templates");
}

async function updateTemplateStatusAction(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  if (session.role === "viewer") return;
  const templateId = String(formData.get("templateId") || "");
  const nextStatus = String(formData.get("status") || "") as TemplateRecord["status"];
  if (!["draft", "published", "archived"].includes(nextStatus || "")) return;
  const template = await service.getById(templateId);
  if (!template || !canAccessOffice(session, template.officeId)) return;
  await service.updateStatus({ actor: { userId: session.userId, role: session.role }, template, nextStatus });
  revalidatePath("/templates");
}

/** Use template for a new agreement — auto-publishes draft templates. */
async function useTemplateAction(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  if (session.role === "viewer") return;
  const templateId = String(formData.get("templateId") || "").trim();
  if (!templateId) return;
  const template = await service.getById(templateId);
  if (!template || !canAccessOffice(session, template.officeId)) return;
  if (template.status !== "published") {
    await service.updateStatus({
      actor: { userId: session.userId, role: session.role },
      template,
      nextStatus: "published",
      skipPublishValidation: true,
    });
  }
  revalidatePath("/templates");
  redirect(`/documents/new?template=${encodeURIComponent(templateId)}`);
}

async function deleteTemplateAction(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  if (session.role === "viewer") return;
  const templateId = String(formData.get("templateId") || "");
  const template = await service.getById(templateId);
  if (!template || !canAccessOffice(session, template.officeId)) return;
  await service.deleteTemplate({
    actor: { userId: session.userId, email: session.email, role: session.role },
    template,
  });
  revalidatePath("/templates");
}

async function matchingAction(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  if (session.role === "viewer") return;
  const templateId = String(formData.get("templateId") || "");
  const matchingEligible = String(formData.get("matchingEligible") || "") === "1";
  const templates = await readTemplates();
  const template = templates.find((item) => item.id === templateId);
  if (!template || !canAccessOffice(session, template.officeId)) return;
  template.matchingEligible = matchingEligible;
  template.updatedAt = new Date().toISOString();
  await writeTemplates(templates);
  revalidatePath("/templates");
}

async function createFolderAction(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  if (session.role === "viewer") return;
  const name = String(formData.get("name") || "").trim();
  const kind = String(formData.get("kind") || "my") === "shared" ? "shared" : "my";
  const requestedOfficeId = String(formData.get("officeId") || "").trim();
  const offices = await readOffices(true);
  const officeId =
    session.role === "super_admin"
      ? requestedOfficeId || session.officeId || offices[0]?.id || ""
      : session.officeId || "";
  if (!name || !officeId || !canAccessOffice(session, officeId)) return;
  const folders = await readTemplateFolders();
  const now = new Date().toISOString();
  const folder: TemplateFolderRecord = {
    id: crypto.randomUUID(),
    officeId,
    name,
    kind,
    createdAt: now,
    updatedAt: now,
  };
  folders.push(folder);
  await writeTemplateFolders(folders);
  revalidatePath("/templates");
  redirect(`/templates?folder=${encodeURIComponent(folder.id)}`);
}

async function renameFolderAction(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  if (session.role === "viewer") return;
  const folderId = String(formData.get("folderId") || "").trim();
  const name = String(formData.get("name") || "").trim();
  if (!folderId || !name) return;
  const folders = await readTemplateFolders();
  const folder = folders.find((item) => item.id === folderId);
  if (!folder || !canAccessOffice(session, folder.officeId)) return;
  folder.name = name;
  folder.updatedAt = new Date().toISOString();
  await writeTemplateFolders(folders);
  revalidatePath("/templates");
  redirect(`/templates?folder=${encodeURIComponent(folder.id)}`);
}

async function deleteFolderAction(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  if (session.role === "viewer") return;
  const folderId = String(formData.get("folderId") || "").trim();
  if (!folderId) return;
  const folders = await readTemplateFolders();
  const folder = folders.find((item) => item.id === folderId);
  if (!folder || !canAccessOffice(session, folder.officeId)) return;
  await writeTemplateFolders(folders.filter((item) => item.id !== folderId));
  const templates = await readTemplates();
  let changed = false;
  for (const template of templates) {
    const nextIds = (template.folderIds || []).filter((id) => id !== folderId);
    if (nextIds.length !== (template.folderIds || []).length) {
      template.folderIds = nextIds;
      template.updatedAt = new Date().toISOString();
      changed = true;
    }
  }
  if (changed) await writeTemplates(templates);
  revalidatePath("/templates");
  redirect("/templates");
}

async function moveTemplateAction(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  if (session.role === "viewer") return;
  const templateId = String(formData.get("templateId") || "");
  const folderId = String(formData.get("folderId") || "").trim();
  const templates = await readTemplates();
  const template = templates.find((item) => item.id === templateId);
  if (!template || !canAccessOffice(session, template.officeId)) return;
  template.folderIds = folderId ? [folderId] : [];
  template.updatedAt = new Date().toISOString();
  await writeTemplates(templates);
  revalidatePath("/templates");
}

async function shareTemplateAction(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  if (session.role === "viewer") return;
  const templateId = String(formData.get("templateId") || "");
  const folderId = String(formData.get("folderId") || "").trim();
  if (!folderId) return;
  const templates = await readTemplates();
  const template = templates.find((item) => item.id === templateId);
  if (!template || !canAccessOffice(session, template.officeId)) return;
  const ids = new Set(template.folderIds || []);
  ids.add(folderId);
  template.folderIds = [...ids];
  template.updatedAt = new Date().toISOString();
  await writeTemplates(templates);
  revalidatePath("/templates");
}

async function createPowerFormAction(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  if (session.role === "viewer") return;
  const templateId = String(formData.get("templateId") || "");
  const name = String(formData.get("name") || "").trim();
  const template = await service.getById(templateId);
  if (!template || !canAccessOffice(session, template.officeId)) return;
  let form;
  try {
    form = await createPowerFormFromTemplate({
      template,
      name: name || template.name,
      actor: { userId: session.userId, email: session.email },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create PowerForm.";
    redirect(`/templates?error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/templates");
  revalidatePath("/powerforms");
  redirect(`/powerforms?created=${form.slug}`);
}

async function createWebFormAction(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  if (session.role === "viewer") return;
  const templateId = String(formData.get("templateId") || "");
  const name = String(formData.get("name") || "").trim();
  const instructions = String(formData.get("instructions") || "").trim();
  const template = await service.getById(templateId);
  if (!template || !canAccessOffice(session, template.officeId)) return;
  let form;
  try {
    form = await createWebFormFromTemplate({
      template,
      name: name || template.name,
      instructions,
      actor: { userId: session.userId, email: session.email },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create Web Form.";
    redirect(`/templates?error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/templates");
  revalidatePath("/webforms");
  redirect(`/webforms?created=${form.slug}`);
}

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; create?: string; folder?: string; error?: string }>;
}) {
  const session = await requireAdmin();
  const office = await getSessionOffice(session);
  const { view = "", create = "", folder: folderId = "", error = "" } = await searchParams;
  const offices = session.role === "super_admin" ? await readOffices() : office ? [office] : [];
  const activeOffices = offices.filter((item) => item.isActive);
  const templates = await service.list({
    officeId: session.role === "super_admin" ? undefined : session.officeId || undefined,
    includeGlobal: session.role !== "viewer",
  });
  const folders = await readTemplateFolders(session.role === "super_admin" ? undefined : session.officeId || undefined);
  const powerForms = await readPowerForms(session.role === "super_admin" ? undefined : session.officeId || undefined);
  const powerFormCounts = powerForms.reduce<Record<string, number>>((acc, form) => {
    acc[form.templateId] = (acc[form.templateId] || 0) + 1;
    return acc;
  }, {});
  const officeNames = Object.fromEntries(offices.map((item) => [item.id, item.name]));
  const canCreate = session.role !== "viewer" && activeOffices.length > 0;
  const canManage = session.role !== "viewer";
  const activeFolder = folders.find((item) => item.id === folderId) || null;
  const sortedTemplates = [...templates]
    .filter((template) => {
      if (view === "global") return template.visibility === "global";
      if (activeFolder) return (template.folderIds || []).includes(activeFolder.id);
      return true;
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <AdminShell session={session} office={office}>
      {error ? (
        <div className="mb-4 rounded-[2px] border border-[#f5c2c7] bg-[#fff5f5] px-4 py-3 text-[14px] text-[#b00020]">
          {error}
        </div>
      ) : null}
      <TemplatesWorkspace
        templates={sortedTemplates}
        view={view}
        folderId={activeFolder?.id || ""}
        folderName={activeFolder?.name || ""}
        showCreate={create === "1" || view === "create"}
        canCreate={canCreate}
        canManage={canManage}
        officeNames={officeNames}
        offices={activeOffices}
        folders={folders}
        powerFormCounts={powerFormCounts}
        defaultOfficeId={session.officeId || activeOffices[0]?.id || ""}
        allowOfficeSelection={session.role === "super_admin"}
        createAction={createTemplateAction}
        duplicateAction={duplicateTemplateAction}
        updateStatusAction={updateTemplateStatusAction}
        useTemplateAction={useTemplateAction}
        deleteAction={canManage ? deleteTemplateAction : undefined}
        matchingAction={matchingAction}
        moveAction={moveTemplateAction}
        shareAction={shareTemplateAction}
        createFolderAction={createFolderAction}
        renameFolderAction={renameFolderAction}
        deleteFolderAction={deleteFolderAction}
        createPowerFormAction={createPowerFormAction}
        createWebFormAction={createWebFormAction}
      />
    </AdminShell>
  );
}
