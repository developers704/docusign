import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
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

function errorRedirect(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

async function createOfficeAction(formData: FormData) {
  "use server";
  await requireSuperAdmin();
  const officeName = String(formData.get("officeName") || "").trim();
  const firstName = String(formData.get("adminFirstName") || "").trim();
  const lastName = String(formData.get("adminLastName") || "").trim();
  const adminName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const adminEmail = String(formData.get("adminEmail") || "").trim();
  const adminPassword = String(formData.get("adminPassword") || "");
  if (!officeName || !adminName || !/^\S+@\S+\.\S+$/.test(adminEmail) || adminPassword.length < 8) {
    errorRedirect("/offices", "Office name, user name, valid email, and password (8+ chars) are required.");
  }
  try {
    const created = await createOfficeWithAdmin({
      officeName,
      officeEmail: adminEmail,
      adminName,
      adminEmail,
      adminPassword,
    });
    revalidatePath("/offices");
    revalidatePath("/");
    redirect(`/offices?office=${encodeURIComponent(created.office.id)}&ok=created`);
  } catch (error) {
    if (
      typeof error === "object" &&
      error &&
      "digest" in error &&
      String((error as { digest?: string }).digest || "").startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    errorRedirect("/offices", error instanceof Error ? error.message : "Could not create office.");
  }
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
  redirect(`/offices?office=${encodeURIComponent(officeId)}`);
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
  redirect("/offices");
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
  if (!officeId || !name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
    errorRedirect(officeId ? `/offices?office=${officeId}` : "/offices", "Name, valid email, and password (8+ chars) are required.");
  }
  try {
    await createOfficeUser({ officeId, name, email, password, role });
  } catch (error) {
    if (
      typeof error === "object" &&
      error &&
      "digest" in error &&
      String((error as { digest?: string }).digest || "").startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    errorRedirect(
      `/offices?office=${encodeURIComponent(officeId)}`,
      error instanceof Error ? error.message : "Could not create account."
    );
  }
  revalidatePath("/offices");
  redirect(`/offices?office=${encodeURIComponent(officeId)}&ok=account`);
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
  redirect(`/offices?office=${encodeURIComponent(user.officeId)}`);
}

async function resetPasswordAction(formData: FormData) {
  "use server";
  await requireSuperAdmin();
  const userId = String(formData.get("userId") || "");
  const password = String(formData.get("password") || "");
  if (!userId || password.length < 8) return;
  const users = await readUsers();
  const user = users.find((item) => item.id === userId);
  await updateUserPassword(userId, password);
  revalidatePath("/offices");
  if (user) redirect(`/offices?office=${encodeURIComponent(user.officeId)}`);
}

function roleName(role: UserRecord["role"]) {
  if (role === "office_admin") return "Office Admin";
  if (role === "office_user") return "Office User";
  return "Viewer";
}

const fieldClass =
  "h-10 w-full rounded-xl border border-[#e6e0ec] bg-white px-3 text-sm text-[#2a2040] outline-none focus:border-[#a78bfa]";
const btnOutline =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-[#e6e0ec] bg-white px-2.5 text-[12px] font-semibold text-[#2a2040] hover:bg-[#f7f5fb]";
const btnPrimary =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-lg bg-[#2a2040] px-2.5 text-[12px] font-semibold text-white hover:bg-[#4c00ff]";
const btnDanger =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-[#f1c4c8] bg-white px-2.5 text-[12px] font-semibold text-[#b42318] hover:bg-[#fef3f2]";
const btnAccent =
  "inline-flex h-10 w-full items-center justify-center rounded-xl bg-[#4c00ff] px-4 text-sm font-semibold text-white hover:bg-[#3d00cf]";

export default async function OfficesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string; office?: string }>;
}) {
  const session = await requireSuperAdmin();
  const offices = (await readOffices()).sort((a, b) => a.name.localeCompare(b.name));
  const users = await readUsers();
  const envelopes = await readEnvelopes();
  const params = await searchParams;
  const flashError = String(params.error || "").trim();
  const flashOk = String(params.ok || "").trim();
  const openOfficeId = String(params.office || "").trim();
  const selectedOffice = offices.find((item) => item.id === openOfficeId) || null;
  const selectedUsers = selectedOffice ? users.filter((user) => user.officeId === selectedOffice.id) : [];
  const selectedEnvelopes = selectedOffice
    ? envelopes.filter((envelope) => envelope.officeId === selectedOffice.id)
    : [];

  return (
    <AdminShell session={session}>
      <div className="border-b border-[#ebe6f0] px-4 py-5 sm:px-6 lg:px-8">
        <p className="text-sm font-semibold text-[#8a7f96]">Network administration</p>
        <h1 className="mt-1 text-[26px] font-semibold tracking-[-.02em] text-[#2a2040] sm:text-[32px] sm:font-normal">
          Office workspaces
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6f657c]">
          Compact office list. Open an office to manage its portal accounts. Each email can only be used once.
        </p>
        {flashError ? (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {flashError}
          </p>
        ) : null}
        {flashOk && !flashError ? (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
            {flashOk === "account" ? "Portal account created." : "Office workspace created."}
          </p>
        ) : null}
      </div>

      <div className="mx-auto grid max-w-[1400px] gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6 lg:p-8">
        <section className="min-w-0 space-y-4">
          {offices.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#ddd6e2] bg-white px-6 py-16 text-center text-sm text-[#6f657c]">
              No office workspaces yet. Use the form to create the first office.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[#ebe6f0] bg-white shadow-[0_1px_2px_rgba(33,0,76,.04)]">
              <div className="border-b border-[#ebe6f0] px-4 py-3 sm:px-5">
                <p className="text-xs font-semibold uppercase tracking-[.08em] text-[#8a7f96]">
                  {offices.length} office{offices.length === 1 ? "" : "s"}
                </p>
              </div>
              <ul className="divide-y divide-[#f0ebf4]">
                {offices.map((office) => {
                  const officeUsers = users.filter((user) => user.officeId === office.id);
                  const officeEnvelopes = envelopes.filter((envelope) => envelope.officeId === office.id);
                  const isOpen = selectedOffice?.id === office.id;
                  return (
                    <li key={office.id} className={isOpen ? "bg-[#faf8fc]" : "bg-white hover:bg-[#fcfbfd]"}>
                      <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                        <Link
                          href={isOpen ? "/offices" : `/offices?office=${encodeURIComponent(office.id)}`}
                          className="min-w-0 flex-1"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: office.brandColor || "#4c00ff" }}
                              aria-hidden
                            />
                            <span className="text-[15px] font-semibold text-[#2a2040]">{office.name}</span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                office.isActive ? "bg-[#e8f8ef] text-[#087a4a]" : "bg-[#f1eef3] text-[#716678]"
                              }`}
                            >
                              {office.isActive ? "Active" : "Disabled"}
                            </span>
                            {isOpen ? (
                              <span className="rounded-full bg-[#eee8ff] px-2 py-0.5 text-[10px] font-semibold text-[#5b21b6]">
                                Open
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 truncate text-xs text-[#8a7f96]">
                            {office.email || "No contact email"} · {officeUsers.length} accounts ·{" "}
                            {officeEnvelopes.length} contracts
                          </p>
                        </Link>
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={isOpen ? "/offices" : `/offices?office=${encodeURIComponent(office.id)}`}
                            className={btnOutline}
                          >
                            {isOpen ? "Close" : "Open accounts"}
                          </Link>
                          <form action={toggleOfficeAction}>
                            <input type="hidden" name="officeId" value={office.id} />
                            <button type="submit" className={btnOutline}>
                              {office.isActive ? "Disable" : "Enable"}
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
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {selectedOffice ? (
            <article className="overflow-hidden rounded-2xl border border-[#ebe6f0] bg-white shadow-[0_1px_2px_rgba(33,0,76,.04)]">
              <div className="flex flex-col gap-3 border-b border-[#ebe6f0] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#8a7f96]">Portal accounts</p>
                  <h2 className="mt-1 text-lg font-semibold text-[#2a2040]">{selectedOffice.name}</h2>
                  <p className="mt-1 text-sm text-[#6f657c]">
                    {selectedUsers.length} account{selectedUsers.length === 1 ? "" : "s"} · slug{" "}
                    <span className="font-medium text-[#2a2040]">{selectedOffice.slug}</span>
                  </p>
                </div>
                <Link href="/offices" className={btnOutline}>
                  Close
                </Link>
              </div>

              <div className="p-4 sm:p-5">
                {selectedUsers.length === 0 ? (
                  <p className="text-sm text-[#6f657c]">No portal accounts yet.</p>
                ) : (
                  <>
                    <div className="space-y-3 lg:hidden">
                      {selectedUsers.map((user) => (
                        <div key={user.id} className="rounded-xl border border-[#ebe6f0] bg-[#faf8fc] p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[#2a2040]">{user.name}</p>
                              <p className="truncate text-xs text-[#6f657c]">{user.email}</p>
                              <p className="mt-1 text-xs text-[#3d3848]">{roleName(user.role)}</p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                user.isActive ? "bg-[#e8f8ef] text-[#087a4a]" : "bg-[#f1eef3] text-[#716678]"
                              }`}
                            >
                              {user.isActive ? "Active" : "Disabled"}
                            </span>
                          </div>
                          <p className="mt-2 text-[11px] text-[#6f657c]">
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
                                className="h-8 min-w-0 flex-1 rounded-lg border border-[#e6e0ec] px-2 text-xs outline-none focus:border-[#a78bfa]"
                              />
                              <button type="submit" className={btnPrimary}>
                                Reset
                              </button>
                            </form>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="hidden overflow-x-auto rounded-xl border border-[#ebe6f0] lg:block">
                      <table className="w-full min-w-[720px] text-left">
                        <thead>
                          <tr className="border-b border-[#ebe6f0] bg-[#faf8fc] text-[11px] font-semibold uppercase tracking-[.06em] text-[#8a7f96]">
                            <th className="px-3 py-2.5">Member</th>
                            <th className="px-3 py-2.5">Role</th>
                            <th className="px-3 py-2.5">Status</th>
                            <th className="px-3 py-2.5">Last login</th>
                            <th className="px-3 py-2.5 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#f0ebf4]">
                          {selectedUsers.map((user) => (
                            <tr key={user.id} className="hover:bg-[#fcfbfd]">
                              <td className="px-3 py-3">
                                <p className="text-sm font-semibold text-[#2a2040]">{user.name}</p>
                                <p className="text-xs text-[#6f657c]">{user.email}</p>
                              </td>
                              <td className="px-3 py-3 text-sm text-[#3d3848]">{roleName(user.role)}</td>
                              <td className="px-3 py-3">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                    user.isActive ? "bg-[#e8f8ef] text-[#087a4a]" : "bg-[#f1eef3] text-[#716678]"
                                  }`}
                                >
                                  {user.isActive ? "Active" : "Disabled"}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-xs text-[#6f657c]">
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
                                      className="h-8 w-28 rounded-lg border border-[#e6e0ec] px-2 text-xs outline-none focus:border-[#a78bfa] xl:w-32"
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

                <details className="mt-4 rounded-xl border border-[#ebe6f0] bg-[#faf8fc] open:bg-white">
                  <summary className="cursor-pointer list-none px-3 py-3 text-sm font-semibold text-[#2a2040] marker:content-none [&::-webkit-details-marker]:hidden">
                    <span className="inline-flex items-center gap-2">
                      <span className="text-[#4c00ff]">+</span> Add portal account
                    </span>
                  </summary>
                  <form action={addAccountAction} className="border-t border-[#f0ebf4] p-3 sm:p-4">
                    <input type="hidden" name="officeId" value={selectedOffice.id} />
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

                <p className="mt-3 text-[11px] text-[#8a7f96]">
                  {selectedEnvelopes.length} contract{selectedEnvelopes.length === 1 ? "" : "s"} in this office.
                </p>
              </div>
            </article>
          ) : offices.length > 0 ? (
            <div className="rounded-2xl border border-dashed border-[#ddd6e2] bg-[#faf8fc] px-5 py-8 text-center text-sm text-[#6f657c]">
              Select an office and click <span className="font-semibold text-[#2a2040]">Open accounts</span> to manage
              its users.
            </div>
          ) : null}
        </section>

        <aside className="order-first rounded-2xl border border-[#ebe6f0] bg-white p-4 shadow-[0_1px_2px_rgba(33,0,76,.04)] sm:p-5 lg:order-none lg:sticky lg:top-20">
          <h2 className="text-base font-semibold text-[#2a2040]">Create office</h2>
          <p className="mt-1 text-sm leading-5 text-[#6f657c]">
            Office name becomes the slug. Add the first portal user below.
          </p>
          <form action={createOfficeAction} className="mt-4 space-y-3">
            <input name="officeName" required placeholder="Office name" className={fieldClass} />
            <div className="border-t border-[#f0ebf4] pt-4">
              <p className="mb-3 text-sm font-semibold text-[#2a2040]">Portal user</p>
              <div className="space-y-3">
                <input name="adminFirstName" required placeholder="First name" className={fieldClass} />
                <input name="adminLastName" required placeholder="Last name" className={fieldClass} />
                <input name="adminEmail" type="email" required placeholder="Email" className={fieldClass} />
                <input
                  name="adminPassword"
                  type="password"
                  minLength={8}
                  required
                  placeholder="Password (8+ chars)"
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
