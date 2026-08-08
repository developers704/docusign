import AdminShell from "@/components/AdminShell";
import { Icon } from "@/components/Icons";
import { getSessionOffice, requireAdmin } from "@/lib/auth";
import { readEnvelopes } from "@/lib/store";

export default async function ContactsPage() {
  const session = await requireAdmin();
  const office = await getSessionOffice(session);
  const envelopes = await readEnvelopes(session.role === "super_admin" ? undefined : session.officeId);
  const map = new Map<string, { name: string; email: string; agreements: number; last: string }>();
  envelopes.forEach((e) =>
    e.recipients.forEach((r) => {
      const key = r.email.toLowerCase();
      const current = map.get(key);
      map.set(key, {
        name: r.name,
        email: r.email,
        agreements: (current?.agreements || 0) + 1,
        last: current && current.last > e.updatedAt ? current.last : e.updatedAt,
      });
    })
  );
  const contacts = [...map.values()].sort((a, b) => b.last.localeCompare(a.last));

  return (
    <AdminShell session={session} office={office}>
      <div className="border-b border-[#e6e6ec] px-6 py-6 sm:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold text-[#6b6578]">Directory</p>
            <h1 className="mt-1 text-[32px] font-normal tracking-[-.02em] text-[#21004c]">Contacts</h1>
            <p className="mt-2 text-sm text-[#6b6578]">A shared recipient directory built from contract activity.</p>
          </div>
          <button className="inline-flex h-10 items-center gap-2 rounded-md bg-[#21004c] px-4 text-sm font-bold text-white">
            <Icon name="plus" className="h-4 w-4" />
            Add contact
          </button>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] max-w-md flex-1">
            <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b6578]" />
            <input
              className="h-10 w-full rounded-md border border-[#c8c8d3] pl-9 pr-3 text-sm outline-none focus:border-[#21004c]"
              placeholder="Search contacts"
            />
          </div>
          <button className="inline-flex h-10 items-center gap-2 rounded-md border border-[#c8c8d3] px-3 text-xs font-bold text-[#21004c]">
            <Icon name="upload" className="h-4 w-4" />
            Import CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[760px] text-left">
          <thead>
            <tr className="border-b border-[#e6e6ec] text-[11px] font-bold uppercase tracking-[.08em] text-[#6b6578]">
              <th className="px-6 py-3">Contact</th>
              <th className="px-4 py-3">Contracts</th>
              <th className="px-4 py-3">Last activity</th>
              <th className="px-4 py-3">Verification</th>
              <th className="px-6 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ececf1]">
            {contacts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-20 text-center text-sm text-[#6b6578]">
                  Contacts will appear after recipients are added to contracts.
                </td>
              </tr>
            ) : (
              contacts.map((c) => (
                <tr key={c.email} className="hover:bg-[#fafafa]">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e9e1ff] text-[11px] font-extrabold text-[#4c00ff]">
                        {c.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-[#21004c]">{c.name}</p>
                        <p className="text-xs text-[#6b6578]">{c.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm font-semibold text-[#3d3848]">{c.agreements}</td>
                  <td className="px-4 py-4 text-xs text-[#6b6578]">{new Date(c.last).toLocaleString()}</td>
                  <td className="px-4 py-4">
                    <span className="rounded-full bg-[#e9f3ff] px-2.5 py-0.5 text-[10px] font-bold text-[#2865aa]">
                      Email verified
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="rounded-md p-2 hover:bg-[#f0f0f4]">
                      <Icon name="more" className="h-5 w-5 text-[#6b6578]" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
