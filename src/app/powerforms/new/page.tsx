import AdminShell from "@/components/AdminShell";
import PowerFormEditor from "@/components/powerforms/PowerFormEditor";
import { getSessionOffice, requireAdmin } from "@/lib/auth";
import { readOffices, readTemplates } from "@/lib/store";

export default async function NewPowerFormPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; office?: string }>;
}) {
  const session = await requireAdmin();
  if (session.role === "viewer") {
    return (
      <AdminShell session={session} office={await getSessionOffice(session)}>
        <p className="p-8 text-[14px] text-[#b00020]">You do not have permission to create PowerForms.</p>
      </AdminShell>
    );
  }
  const office = await getSessionOffice(session);
  const { template: templateId = "", office: officeParam = "" } = await searchParams;
  const templates = await readTemplates(session.role === "super_admin" ? undefined : session.officeId || undefined);
  const offices =
    session.role === "super_admin"
      ? (await readOffices(true)).map((item) => ({ id: item.id, name: item.name }))
      : office
        ? [{ id: office.id, name: office.name }]
        : [];
  const officeNames = Object.fromEntries(offices.map((item) => [item.id, item.name]));
  const defaultOfficeId =
    officeParam ||
    (templateId ? templates.find((item) => item.id === templateId)?.officeId : "") ||
    office?.id ||
    "";

  return (
    <AdminShell session={session} office={office}>
      <div className="px-8 py-7">
        <h1 className="text-[28px] font-semibold text-[#21004c]">Create PowerForm</h1>
        <p className="mt-2 mb-6 text-[14px] text-[#666]">
          Select a workspace and published template, configure intake fields, then share the link.
        </p>
        <PowerFormEditor
          templates={templates}
          offices={offices}
          officeNames={officeNames}
          defaultTemplateId={templateId}
          defaultOfficeId={defaultOfficeId}
          mode="create"
        />
      </div>
    </AdminShell>
  );
}
