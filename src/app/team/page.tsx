import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import AdminShell from "@/components/AdminShell";
import TeamWorkspace from "@/components/TeamWorkspace";
import { canManageOfficeUsers, getSessionOffice, requireAdmin } from "@/lib/auth";
import {
  createOfficeUser,
  readOffices,
  readUsers,
  updateUserPassword,
  writeUsers,
} from "@/lib/store";
import type { UserRecord } from "@/lib/types";

function errorRedirect(message: string): never {
  redirect(`/team?error=${encodeURIComponent(message)}`);
}

async function inviteMemberAction(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  const officeId = String(formData.get("officeId") || session.officeId || "").trim();
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const roleValue = String(formData.get("role") || "office_user");
  const role: UserRecord["role"] = ["office_admin", "office_user", "viewer"].includes(roleValue)
    ? (roleValue as UserRecord["role"])
    : "office_user";

  if (!officeId || !canManageOfficeUsers(session, officeId)) {
    errorRedirect("You cannot invite users for this office.");
  }
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
    errorRedirect("Name, valid email, and password (8+ chars) are required.");
  }

  try {
    await createOfficeUser({ officeId, name, email, password, role });
  } catch (error) {
    errorRedirect(error instanceof Error ? error.message : "Could not create account.");
  }
  revalidatePath("/team");
  revalidatePath("/offices");
  redirect("/team?ok=invited");
}

async function toggleUserAction(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const users = await readUsers();
  const user = users.find((item) => item.id === userId);
  if (!user || !canManageOfficeUsers(session, user.officeId)) return;
  user.isActive = !user.isActive;
  user.updatedAt = new Date().toISOString();
  await writeUsers(users);
  revalidatePath("/team");
  revalidatePath("/offices");
}

async function resetPasswordAction(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const password = String(formData.get("password") || "");
  if (!userId || password.length < 8) return;
  const users = await readUsers();
  const user = users.find((item) => item.id === userId);
  if (!user || !canManageOfficeUsers(session, user.officeId)) return;
  await updateUserPassword(userId, password);
  revalidatePath("/team");
  revalidatePath("/offices");
}

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const session = await requireAdmin();
  const office = await getSessionOffice(session);
  const allUsers = await readUsers();
  const offices = (await readOffices()).filter((item) => item.isActive);
  const users =
    session.role === "super_admin" ? allUsers : allUsers.filter((item) => item.officeId === session.officeId);
  const officeNames = Object.fromEntries((await readOffices()).map((item) => [item.id, item.name]));
  const canInvite =
    session.role === "super_admin" ||
    (session.role === "office_admin" && Boolean(session.officeId));
  const defaultOfficeId = session.officeId || offices[0]?.id || "";
  const params = await searchParams;
  const flashError = String(params.error || "").trim();
  const flashOk = String(params.ok || "").trim();

  return (
    <AdminShell session={session} office={office}>
      {flashError ? (
        <div className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm font-semibold text-red-700">
          {flashError}
        </div>
      ) : null}
      {flashOk && !flashError ? (
        <div className="border-b border-emerald-200 bg-emerald-50 px-6 py-3 text-sm font-semibold text-emerald-800">
          Team member invited.
        </div>
      ) : null}
      <TeamWorkspace
        users={users}
        offices={session.role === "super_admin" ? offices : office ? [office] : []}
        officeNames={officeNames}
        canInvite={canInvite}
        defaultOfficeId={defaultOfficeId}
        allowOfficeSelection={session.role === "super_admin"}
        inviteAction={inviteMemberAction}
        toggleUserAction={toggleUserAction}
        resetPasswordAction={resetPasswordAction}
      />
    </AdminShell>
  );
}
