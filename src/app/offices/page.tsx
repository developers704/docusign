import { revalidatePath } from "next/cache";
import AdminShell from "@/components/AdminShell";
import { requireSuperAdmin } from "@/lib/auth";
import {
  createOfficeUser,
  createOfficeWithAdmin,
  deleteOfficeWorkspace,
  readEnvelopes,
  readOffices,
  readUsers,
  updateUserPassword,
  writeOffices,
  writeUsers,
} from "@/lib/store";
import type { UserRecord } from "@/lib/types";
import DeleteOfficeButton from "@/components/DeleteOfficeButton";

async function createOfficeAction(formData: FormData) {
  "use server";
  await requireSuperAdmin();
  const officeName = String(formData.get("officeName") || "").trim();
  const adminName = String(formData.get("adminName") || "").trim();
  const adminEmail = String(formData.get("adminEmail") || "").trim();
  const adminPassword = String(formData.get("adminPassword") || "");
  if (!officeName || !adminName || !/^\S+@\S+\.\S+$/.test(adminEmail) || adminPassword.length < 8) return;
  await createOfficeWithAdmin({
    officeName,
    slug: String(formData.get("slug") || ""),
    officeEmail: String(formData.get("officeEmail") || ""),
    phone: String(formData.get("phone") || ""),
    address: String(formData.get("address") || ""),
    brandColor: String(formData.get("brandColor") || "#21004c"),
    adminName,
    adminEmail,
    adminPassword,
  });
  revalidatePath("/offices");
  revalidatePath("/");
}

async function toggleOfficeAction(formData: FormData) {
  "use server";
  await requireSuperAdmin();
  const officeId = String(formData.get("officeId") || "");
  const offices = await readOffices();
  const office = offices.find((item) => item.id === officeId);
  if (!office) return;
  office.isActive = !office.isActive;
  office.updatedAt = new Date().toISOString();
  await writeOffices(offices);
  revalidatePath("/offices");
  revalidatePath("/");
}

async function deleteOfficeAction(formData: FormData) {
  "use server";
  await requireSuperAdmin();
  const officeId = String(formData.get("officeId") || "").trim();
  if (!officeId) return;
  await deleteOfficeWorkspace(officeId);
  revalidatePath("/offices");
  revalidatePath("/");
  revalidatePath("/agreements");
  revalidatePath("/team");
}

async function addAccountAction(formData: FormData) {
  "use server";
  await requireSuperAdmin();
  const officeId = String(formData.get("officeId") || "");
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const roleValue = String(formData.get("role") || "office_user");
  const role: UserRecord["role"] = ["office_admin", "office_user", "viewer"].includes(roleValue)
    ? (roleValue as UserRecord["role"])
    : "office_user";
  if (!officeId || !name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) return;
  await createOfficeUser({ officeId, name, email, password, role });
  revalidatePath("/offices");
}

async function toggleUserAction(formData: FormData) {
  "use server";
  await requireSuperAdmin();
  const userId = String(formData.get("userId") || "");
  const users = await readUsers();
  const user = users.find((item) => item.id === userId);
  if (!user) return;
  user.isActive = !user.isActive;
  user.updatedAt = new Date().toISOString();
  await writeUsers(users);
  revalidatePath("/offices");
}

async function resetPasswordAction(formData: FormData) {
  "use server";
  await requireSuperAdmin();
  const userId = String(formData.get("userId") || "");
  const password = String(formData.get("password") || "");
  if (!userId || password.length < 8) return;
  await updateUserPassword(userId, password);
  revalidatePath("/offices");
}

function roleName(role: UserRecord["role"]) {
  if (role === "office_admin") return "Office Admin";
  if (role === "office_user") return "Office User";
  return "Viewer";
}

const fieldClass =
  "h-10 w-full rounded-[2px] border border-[#c8c8d3] bg-white px-3 text-sm text-[#21004c] outline-none focus:border-[#4c00ff]";
const btnOutline =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-[2px] border border-[#c8c8d3] bg-white px-2.5 text-[12px] font-semibold text-[#21004c] hover:bg-[#f0ebff]";
const btnPrimary =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-[2px] bg-[#21004c] px-2.5 text-[12px] font-semibold text-white hover:bg-[#3d00cf]";
const btnDanger =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-[2px] border border-[#f1c4c8] bg-white px-2.5 text-[12px] font-semibold text-[#b42318] hover:bg-[#fef3f2]";
const btnAccent =
  "inline-flex h-10 w-full items-center justify-center rounded-[2px] bg-[#4c00ff] px-4 text-sm font-semibold text-white hover:bg-[#3d00cf]";

export default async function OfficesPage() {
  const session = await requireSuperAdmin();
  const offices = (await readOffices()).sort((a, b) => a.name.localeCompare(b.name));
  const users = await readUsers();
  const envelopes = await readEnvelopes();

  return (
    <AdminShell session={session}>
      <div className="border-b border-[#e6e6ec] px-4 py-5 sm:px-6 lg:px-8">
        <p className="text-sm font-semibold text-[#6b6578]">Network administration</p>
        <h1 className="mt-1 text-[26px] font-semibold tracking-[-.02em] text-[#21004c] sm:text-[32px] sm:font-normal">
          Office workspaces
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6b6578]">
          Create one workspace per location. Portal accounts share one login page and only see their assigned office.
        </p>
      </div>

      <div className="mx-auto grid max-w-[1400px] gap-4 p-4 sm:gap-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6 lg:p-8">
        <section className="min-w-0 space-y-4 sm:space-y-5">
          {offices.length === 0 ? (
            <div className="rounded-[4px] border border-dashed border-[#d5d5de] bg-white px-6 py-16 text-center text-sm text-[#6b6578]">
              No office workspaces yet. Use the form to create the first office.
            </div>
          ) : (
            offices.map((office) => {
              const officeUsers = users.filter((user) => user.officeId === office.id);
              const officeEnvelopes = envelopes.filter((envelope) => envelope.officeId === office.id);
              return (
                <article
                  key={office.id}
                  className="overflow-hidden rounded-[4px] border border-[#e6e6ec] bg-white shadow-[0_1px_2px_rgba(19,0,50,.04)]"
                >
                  <div className="flex flex-col gap-4 border-b border-[#ececf1] p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: office.brandColor || "#21004c" }}
                          aria-hidden
                        />
                        <h2 className="text-lg font-semibold text-[#21004c] sm:text-xl">{office.name}</h2>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            office.isActive ? "bg-[#ddf8e9] text-[#087a4a]" : "bg-[#eeeaf0] text-[#716678]"
                          }`}
                        >
                          {office.isActive ? "Active" : "Disabled"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[#6b6578] sm:text-sm">Slug: {office.slug}</p>
                      <p className="mt-2 break-words text-sm text-[#3d3848]">
                        {office.email || "No office email"}
                        {office.phone ? ` · ${office.phone}` : ""}
                      </p>
                      {office.address && <p className="mt-1 text-sm text-[#6b6578]">{office.address}</p>}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <div className="rounded-[2px] border border-[#e6e6ec] bg-[#fafafa] px-3 py-1.5 text-center">
                        <p className="text-base font-semibold leading-none text-[#21004c]">{officeEnvelopes.length}</p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-[.06em] text-[#6b6578]">Envelopes</p>
                      </div>
                      <div className="rounded-[2px] border border-[#e6e6ec] bg-[#fafafa] px-3 py-1.5 text-center">
                        <p className="text-base font-semibold leading-none text-[#21004c]">{officeUsers.length}</p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-[.06em] text-[#6b6578]">Accounts</p>
                      </div>
                      <form action={toggleOfficeAction}>
                        <input type="hidden" name="officeId" value={office.id} />
                        <button type="submit" className={btnOutline}>
                          {office.isActive ? "Disable office" : "Enable office"}
                        </button>
                      </form>
                      <DeleteOfficeButton
                        officeId={office.id}
                        officeName={office.name}
                        envelopeCount={officeEnvelopes.length}
                        accountCount={officeUsers.length}
                        action={deleteOfficeAction}
                        className={btnDanger}
                      />
                    </div>
                  </div>

                  <div className="p-4 sm:p-5">
                    <p className="text-[11px] font-bold uppercase tracking-[.08em] text-[#6b6578]">Portal accounts</p>

                    {officeUsers.length === 0 ? (
                      <p className="mt-3 text-sm text-[#6b6578]">No portal accounts yet.</p>
                    ) : (
                      <>
                        {/* Mobile account cards */}
                        <div className="mt-3 space-y-3 lg:hidden">
                          {officeUsers.map((user) => (
                            <div key={user.id} className="rounded-[2px] border border-[#e6e6ec] bg-[#fafafa] p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-[#21004c]">{user.name}</p>
                                  <p className="truncate text-xs text-[#6b6578]">{user.email}</p>
                                  <p className="mt-1 text-xs text-[#3d3848]">{roleName(user.role)}</p>
                                </div>
                                <span
                                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                    user.isActive ? "bg-[#ddf8e9] text-[#087a4a]" : "bg-[#eeeaf0] text-[#716678]"
                                  }`}
                                >
                                  {user.isActive ? "Active" : "Disabled"}
                                </span>
                              </div>
                              <p className="mt-2 text-[11px] text-[#6b6578]">
                                Last login: {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}
                              </p>
                              <div className="mt-3 flex flex-col gap-2">
                                <form action={toggleUserAction}>
                                  <input type="hidden" name="userId" value={user.id} />
                                  <button type="submit" className={`${btnOutline} w-full`}>
                                    {user.isActive ? "Disable account" : "Enable account"}
                                  </button>
                                </form>
                                <form action={resetPasswordAction} className="flex gap-2">
                                  <input type="hidden" name="userId" value={user.id} />
                                  <input
                                    name="password"
                                    type="password"
                                    minLength={8}
                                    required
                                    placeholder="New password"
                                    className="h-8 min-w-0 flex-1 rounded-[2px] border border-[#c8c8d3] px-2 text-xs outline-none focus:border-[#4c00ff]"
                                  />
                                  <button type="submit" className={btnPrimary}>
                                    Reset
                                  </button>
                                </form>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Desktop table */}
                        <div className="mt-3 hidden overflow-x-auto rounded-[2px] border border-[#e6e6ec] lg:block">
                          <table className="w-full min-w-[720px] text-left">
                            <thead>
                              <tr className="border-b border-[#e6e6ec] bg-[#fafafa] text-[11px] font-bold uppercase tracking-[.06em] text-[#6b6578]">
                                <th className="px-3 py-2.5">Member</th>
                                <th className="px-3 py-2.5">Role</th>
                                <th className="px-3 py-2.5">Status</th>
                                <th className="px-3 py-2.5">Last login</th>
                                <th className="px-3 py-2.5 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#ececf1]">
                              {officeUsers.map((user) => (
                                <tr key={user.id} className="hover:bg-[#fafafa]">
                                  <td className="px-3 py-3">
                                    <p className="text-sm font-semibold text-[#21004c]">{user.name}</p>
                                    <p className="text-xs text-[#6b6578]">{user.email}</p>
                                  </td>
                                  <td className="px-3 py-3 text-sm text-[#3d3848]">{roleName(user.role)}</td>
                                  <td className="px-3 py-3">
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                        user.isActive ? "bg-[#ddf8e9] text-[#087a4a]" : "bg-[#eeeaf0] text-[#716678]"
                                      }`}
                                    >
                                      {user.isActive ? "Active" : "Disabled"}
                                    </span>
                                  </td>
                                  <td className="px-3 py-3 text-xs text-[#6b6578]">
                                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}
                                  </td>
                                  <td className="px-3 py-3">
                                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                                      <form action={toggleUserAction}>
                                        <input type="hidden" name="userId" value={user.id} />
                                        <button type="submit" className={btnOutline}>
                                          {user.isActive ? "Disable" : "Enable"}
                                        </button>
                                      </form>
                                      <form action={resetPasswordAction} className="flex items-center gap-1.5">
                                        <input type="hidden" name="userId" value={user.id} />
                                        <input
                                          name="password"
                                          type="password"
                                          minLength={8}
                                          required
                                          placeholder="New password"
                                          className="h-8 w-28 rounded-[2px] border border-[#c8c8d3] px-2 text-xs outline-none focus:border-[#4c00ff] xl:w-32"
                                        />
                                        <button type="submit" className={btnPrimary}>
                                          Reset
                                        </button>
                                      </form>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}

                    <details className="mt-4 rounded-[2px] border border-[#e6e6ec] bg-[#fafafa] open:bg-white">
                      <summary className="cursor-pointer list-none px-3 py-3 text-sm font-semibold text-[#21004c] marker:content-none [&::-webkit-details-marker]:hidden">
                        <span className="inline-flex items-center gap-2">
                          <span className="text-[#4c00ff]">+</span> Add another portal account
                        </span>
                      </summary>
                      <form action={addAccountAction} className="border-t border-[#ececf1] p-3 sm:p-4">
                        <input type="hidden" name="officeId" value={office.id} />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <input name="name" required placeholder="User name" className={fieldClass} />
                          <input name="email" type="email" required placeholder="user@office.com" className={fieldClass} />
                          <input
                            name="password"
                            type="password"
                            minLength={8}
                            required
                            placeholder="Temporary password (8+ chars)"
                            className={fieldClass}
                          />
                          <select name="role" className={fieldClass}>
                            <option value="office_admin">Office Admin</option>
                            <option value="office_user">Office User</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        </div>
                        <button type="submit" className={`${btnAccent} mt-3 sm:w-auto sm:px-5`}>
                          Create portal account
                        </button>
                      </form>
                    </details>
                  </div>
                </article>
              );
            })
          )}
        </section>

        <aside className="order-first rounded-[4px] border border-[#e6e6ec] bg-white p-4 shadow-[0_1px_2px_rgba(19,0,50,.04)] sm:p-5 lg:order-none lg:sticky lg:top-20">
          <h2 className="text-base font-semibold text-[#21004c] sm:text-lg">Create office workspace</h2>
          <p className="mt-1 text-sm text-[#6b6578]">Creates the office and its first administrator account.</p>
          <form action={createOfficeAction} className="mt-4 space-y-3">
            <input name="officeName" required placeholder="Office name, e.g. Milpitas Office" className={fieldClass} />
            <input name="slug" placeholder="Optional portal slug" className={fieldClass} />
            <input name="officeEmail" type="email" placeholder="Office contact email" className={fieldClass} />
            <input name="phone" placeholder="Office phone" className={fieldClass} />
            <textarea
              name="address"
              rows={2}
              placeholder="Office address"
              className="w-full rounded-[2px] border border-[#c8c8d3] bg-white px-3 py-2 text-sm outline-none focus:border-[#4c00ff]"
            />
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#6b6578]">Portal accent color</label>
              <input
                name="brandColor"
                type="color"
                defaultValue="#21004c"
                className="h-10 w-full rounded-[2px] border border-[#c8c8d3] bg-white p-1"
              />
            </div>
            <div className="border-t border-[#e6e6ec] pt-4">
              <p className="mb-3 text-sm font-semibold text-[#21004c]">First office administrator</p>
              <div className="space-y-3">
                <input name="adminName" required placeholder="Administrator name" className={fieldClass} />
                <input name="adminEmail" type="email" required placeholder="admin@office.com" className={fieldClass} />
                <input
                  name="adminPassword"
                  type="password"
                  minLength={8}
                  required
                  placeholder="Temporary password (8+ chars)"
                  className={fieldClass}
                />
              </div>
            </div>
            <button type="submit" className={btnAccent}>
              Create office and account
            </button>
          </form>
        </aside>
      </div>
    </AdminShell>
  );
}
