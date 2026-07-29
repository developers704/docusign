import Link from "next/link";
import AdminShell from "@/components/AdminShell";
import PowerFormsAdminList from "@/components/powerforms/PowerFormsAdminList";
import { getSessionOffice, requireAdmin } from "@/lib/auth";
import { listPowerForms } from "@/lib/services/powerFormService";
import { readOffices, readTemplates } from "@/lib/store";

export default async function PowerFormsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; template?: string; office?: string }>;
}) {
  const session = await requireAdmin();
  const office = await getSessionOffice(session);
  const { created = "", template: templateFilter = "", office: officeFilter = "" } = await searchParams;
  const scopedOfficeId =
    session.role === "super_admin" ? officeFilter || undefined : session.officeId || undefined;
  const forms = (
    await listPowerForms({
      officeId: session.role === "super_admin" ? undefined : session.officeId || undefined,
      templateId: templateFilter || undefined,
    })
  ).filter((form) => (scopedOfficeId ? form.officeId === scopedOfficeId : true));
  const templates = await readTemplates(session.role === "super_admin" ? undefined : session.officeId || undefined);
  const templateNames = Object.fromEntries(templates.map((item) => [item.id, item.name]));
  const offices =
    session.role === "super_admin"
      ? await readOffices(true)
      : office
        ? [office]
        : [];
  const officeNames = Object.fromEntries(offices.map((item) => [item.id, item.name]));
  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const createdForm = created ? forms.find((form) => form.slug === created || form.id === created) : null;

  return (
    <AdminShell session={session} office={office}>
      <div className="bg-white px-8 py-7 text-[#000]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[28px] font-semibold tracking-[-.01em] text-[#21004c]">PowerForms</h1>
            <p className="mt-2 text-[14px] text-[#666]">
              Shareable links from published templates. Every submission creates its own envelope.
            </p>
          </div>
          <Link
            href={officeFilter ? `/powerforms/new?office=${encodeURIComponent(officeFilter)}` : "/powerforms/new"}
            className="inline-flex h-9 items-center rounded-[2px] bg-[#4c00ff] px-4 text-[13px] font-semibold text-white"
          >
            Create PowerForm
          </Link>
        </div>

        {offices.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/powerforms"
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${
                !officeFilter ? "bg-[#4c00ff] text-white" : "bg-[#f0ebff] text-[#21004c]"
              }`}
            >
              All workspaces
            </Link>
            {offices.map((item) => (
              <Link
                key={item.id}
                href={`/powerforms?office=${encodeURIComponent(item.id)}`}
                className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${
                  officeFilter === item.id ? "bg-[#4c00ff] text-white" : "bg-[#f0ebff] text-[#21004c]"
                }`}
              >
                {item.name}
              </Link>
            ))}
          </div>
        ) : null}

        {createdForm ? (
          <div className="mt-5 rounded-[2px] border border-[#c4b5fd] bg-[#f0ebff] px-4 py-3 text-[14px]">
            PowerForm ready. Public link:{" "}
            <a className="font-semibold text-[#4c00ff] underline" href={`${appUrl}/powerforms/${createdForm.slug}`}>
              {appUrl}/powerforms/{createdForm.slug}
            </a>
          </div>
        ) : null}

        <PowerFormsAdminList forms={forms} templateNames={templateNames} officeNames={officeNames} appUrl={appUrl} />
      </div>
    </AdminShell>
  );
}
