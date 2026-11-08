import Link from "next/link";
import AdminShell from "@/components/AdminShell";
import PublishedFormRowActions from "@/components/powerforms/PublishedFormRowActions";
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
      <div className="bg-white px-4 py-6 text-[#000] sm:px-8 sm:py-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[28px] font-semibold tracking-[-.01em]">Web Forms</h1>
            <p className="mt-2 text-[14px] text-[#666]">
              Online forms that collect signer details, then start the contract.
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
          <>
            <div className="mt-6 -mx-4 space-y-3 px-4 lg:hidden">
              {visible.map((form) => (
                <div key={form.id} className="rounded-[4px] border border-[#ececec] p-4">
                  <p className="text-[15px] font-semibold">{form.name}</p>
                  <p className="mt-1 text-[12px] text-[#666]">
                    {officeNames[form.officeId] || "—"} · {form.status} · {form.usageCount} uses
                  </p>
                  <a className="mt-2 inline-block text-[13px] text-[#4c00ff]" href={`/webforms/${form.slug}`}>
                    /webforms/{form.slug}
                  </a>
                  <div className="mt-3">
                    <PublishedFormRowActions
                      kind="webform"
                      id={form.id}
                      name={form.name}
                      canManage={session.role !== "viewer"}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[900px] border-t border-[#e5e5e5] text-left">
                <thead>
                  <tr className="border-b border-[#e5e5e5] text-[12px] font-semibold text-[#666]">
                    <th className="px-3 py-3">Name</th>
                    <th className="px-3 py-3">Workspace</th>
                    <th className="px-3 py-3">Template</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Uses</th>
                    <th className="px-3 py-3">Public URL</th>
                    <th className="px-3 py-3 text-right">Actions</th>
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
                      <td className="whitespace-nowrap px-3 py-4 text-[13px]">
                        <PublishedFormRowActions
                          kind="webform"
                          id={form.id}
                          name={form.name}
                          canManage={session.role !== "viewer"}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}
