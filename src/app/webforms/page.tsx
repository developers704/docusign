import Link from "next/link";
import AdminShell from "@/components/AdminShell";
import { getSessionOffice, requireAdmin } from "@/lib/auth";
import { readOffices, readTemplates, readWebForms } from "@/lib/store";

export default async function WebFormsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; office?: string }>;
}) {
  const session = await requireAdmin();
  const office = await getSessionOffice(session);
  const { created = "", office: officeFilter = "" } = await searchParams;
  const forms = await readWebForms(session.role === "super_admin" ? undefined : session.officeId || undefined);
  const scopedOfficeId =
    session.role === "super_admin" ? officeFilter || undefined : session.officeId || undefined;
  const visible = forms
    .filter((form) => (scopedOfficeId ? form.officeId === scopedOfficeId : true))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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
  const createdForm = created ? visible.find((form) => form.slug === created) : null;
  const createHref = officeFilter
    ? `/powerforms/new?office=${encodeURIComponent(officeFilter)}`
    : "/powerforms/new";

  return (
    <AdminShell session={session} office={office}>
      <div className="bg-white px-8 py-7 text-[#000]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[28px] font-semibold tracking-[-.01em]">Web Forms</h1>
            <p className="mt-2 text-[14px] text-[#666]">
              Online forms that collect signer details, then start the agreement.
            </p>
          </div>
          {session.role !== "viewer" ? (
            <Link
              href={createHref}
              className="inline-flex h-9 items-center rounded-[2px] bg-[#4c00ff] px-4 text-[13px] font-semibold text-white"
            >
              Create Web Form
            </Link>
          ) : null}
        </div>

        {offices.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/webforms"
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${
                !officeFilter ? "bg-[#4c00ff] text-white" : "bg-[#f0ebff] text-[#21004c]"
              }`}
            >
              All workspaces
            </Link>
            {offices.map((item) => (
              <Link
                key={item.id}
                href={`/webforms?office=${encodeURIComponent(item.id)}`}
                className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${
                  officeFilter === item.id ? "bg-[#4c00ff] text-white" : "bg-[#f0ebff] text-[#21004c]"
                }`}
              >
                {item.name}
              </Link>
            ))}
          </div>
        ) : null}

        {createdForm && (
          <div className="mt-5 rounded-[2px] border border-[#c4b5fd] bg-[#f0ebff] px-4 py-3 text-[14px]">
            Web Form created. Public link:{" "}
            <a className="font-semibold text-[#4c00ff] underline" href={`${appUrl}/webforms/${createdForm.slug}`}>
              {appUrl}/webforms/{createdForm.slug}
            </a>
          </div>
        )}

        {!visible.length ? (
          <div className="mt-16 text-center">
            <h2 className="text-[20px] font-semibold">No Web Forms yet</h2>
            <p className="mt-2 text-[14px] text-[#666]">
              Create a shareable form from a published template for this workspace.
            </p>
            <Link
              href={createHref}
              className="mt-6 inline-flex h-9 items-center rounded-[2px] bg-[#4c00ff] px-4 text-[13px] font-semibold text-white"
            >
              Create Web Form
            </Link>
          </div>
        ) : (
          <table className="mt-6 w-full border-t border-[#e5e5e5] text-left">
            <thead>
              <tr className="border-b border-[#e5e5e5] text-[12px] font-semibold text-[#666]">
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">Workspace</th>
                <th className="px-3 py-3">Template</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Uses</th>
                <th className="px-3 py-3">Public URL</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((form) => (
                <tr key={form.id} className="border-b border-[#ececec]">
                  <td className="px-3 py-4 text-[14px] font-semibold">{form.name}</td>
                  <td className="px-3 py-4 text-[14px]">{officeNames[form.officeId] || "—"}</td>
                  <td className="px-3 py-4 text-[14px]">{templateNames[form.templateId] || form.templateId}</td>
                  <td className="px-3 py-4 text-[14px] capitalize">{form.status}</td>
                  <td className="px-3 py-4 text-[14px]">{form.usageCount}</td>
                  <td className="px-3 py-4 text-[14px]">
                    <a className="text-[#4c00ff] hover:underline" href={`/webforms/${form.slug}`}>
                      /webforms/{form.slug}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminShell>
  );
}
