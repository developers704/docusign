import { revalidatePath } from "next/cache";
import AdminShell from "@/components/AdminShell";
import SmtpSettingsForm from "@/components/SmtpSettingsForm";
import { canAccessOffice, getSessionOffice, refreshSessionCookie, requireAdmin } from "@/lib/auth";
import {
  createPasswordHash,
  getOfficeById,
  readAppProfile,
  readOffices,
  readSmtpSettings,
  updateUserName,
  updateUserPassword,
  writeAppProfile,
  writeOffices,
  writeSmtpSettings,
} from "@/lib/store";
import { getSmtpPublicStatus } from "@/lib/smtp";
import type { SmtpSettingsRecord } from "@/lib/types";

async function updateAccountAction(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  const name = String(formData.get("name") || "").trim();
  const networkName = String(formData.get("networkName") || "").trim();
  const newPassword = String(formData.get("newPassword") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (!name) throw new Error("Name is required.");
  if (newPassword && newPassword.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  if (newPassword && newPassword !== confirmPassword) {
    throw new Error("Password confirmation does not match.");
  }

  if (session.role === "super_admin") {
    const profile = await readAppProfile();
    const next = {
      ...profile,
      adminName: name.slice(0, 120),
      networkName: (networkName || profile.networkName || "Valliani Network").slice(0, 120),
      updatedAt: new Date().toISOString(),
    };
    if (newPassword) {
      const credentials = createPasswordHash(newPassword);
      next.adminPasswordSalt = credentials.passwordSalt;
      next.adminPasswordHash = credentials.passwordHash;
    }
    await writeAppProfile(next);

    // Keep SMTP From name in sync with admin display name when blank.
    const smtp = await readSmtpSettings();
    if (smtp && !String(smtp.fromName || "").trim()) {
      await writeSmtpSettings({ ...smtp, fromName: next.adminName, updatedAt: new Date().toISOString() });
    }

    await refreshSessionCookie({
      ...session,
      name: next.adminName,
    });
  } else {
    if (session.userId === "environment-super-admin") {
      throw new Error("Account cannot be updated.");
    }
    await updateUserName(session.userId, name);
    if (newPassword) await updateUserPassword(session.userId, newPassword);
    await refreshSessionCookie({
      ...session,
      name: name.slice(0, 120),
    });
  }

  revalidatePath("/settings");
  revalidatePath("/");
}

async function updateOfficeAction(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  const officeId = String(formData.get("officeId") || session.officeId || "");
  if (!officeId || !canAccessOffice(session, officeId) || !["super_admin", "office_admin"].includes(session.role)) return;
  const offices = await readOffices();
  const office = offices.find((item) => item.id === officeId);
  if (!office) return;
  office.name = String(formData.get("name") || office.name).trim() || office.name;
  office.email = String(formData.get("email") || "").trim();
  office.phone = String(formData.get("phone") || "").trim();
  office.address = String(formData.get("address") || "").trim();
  office.brandColor = String(formData.get("brandColor") || office.brandColor).trim() || office.brandColor;
  office.updatedAt = new Date().toISOString();
  await writeOffices(offices);
  revalidatePath("/settings");
  revalidatePath("/");
}

async function saveSmtpAction(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  if (session.role !== "super_admin") {
    throw new Error("Only the network administrator can change SMTP settings.");
  }

  const host = String(formData.get("host") || "").trim();
  const user = String(formData.get("user") || "").trim();
  const from = String(formData.get("from") || "").trim() || user;
  const fromName = String(formData.get("fromName") || "").trim();
  const port = Number(formData.get("port") || "465") || 465;
  const secure = String(formData.get("secure") || "") === "1";
  const providerRaw = String(formData.get("provider") || "").trim().toLowerCase();
  const provider: SmtpSettingsRecord["provider"] =
    providerRaw === "gmail" || host.toLowerCase().includes("gmail.com") ? "gmail" : "custom";
  let pass = String(formData.get("pass") || "");

  if (!host || !user || !from) {
    throw new Error("SMTP host, username, and from address are required.");
  }

  if (!pass) {
    const existing = await readSmtpSettings();
    pass = existing?.pass || process.env.SMTP_PASS || "";
  }
  pass = pass.trim();
  if (!pass) {
    throw new Error("Enter the mailbox password (do not leave blank on first save).");
  }

  const startTlsPorts = new Set([25, 587, 2525, 2587]);
  const resolvedSecure =
    provider === "gmail"
      ? !startTlsPorts.has(port)
      : port === 465
        ? true
        : startTlsPorts.has(port)
          ? false
          : secure;

  const profile = await readAppProfile();
  const settings: SmtpSettingsRecord = {
    provider,
    host: provider === "gmail" ? "smtp.gmail.com" : host,
    port: provider === "gmail" && ![465, 587].includes(port) ? 465 : port,
    secure: resolvedSecure,
    user,
    pass,
    from,
    fromName: fromName || profile.adminName || undefined,
    updatedAt: new Date().toISOString(),
  };
  await writeSmtpSettings(settings);
  revalidatePath("/settings");
  revalidatePath("/integrations");
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ office?: string }> }) {
  const session = await requireAdmin();
  const currentOffice = await getSessionOffice(session);
  const params = await searchParams;
  const allOffices = session.role === "super_admin" ? await readOffices() : currentOffice ? [currentOffice] : [];
  const selectedOffice = session.role === "super_admin" && params.office ? await getOfficeById(params.office) : currentOffice;
  const smtpStatus = await getSmtpPublicStatus();
  const profile = await readAppProfile();
  const canEditOffice =
    Boolean(selectedOffice) &&
    ["super_admin", "office_admin"].includes(session.role) &&
    canAccessOffice(session, selectedOffice!.id);

  return (
    <AdminShell session={session} office={currentOffice}>
      <div className="border-b border-[#e6e6ec] px-6 py-6 sm:px-8">
        <p className="text-sm font-semibold text-[#6b6578]">Production configuration</p>
        <h1 className="mt-1 text-[32px] font-normal tracking-[-.02em] text-[#21004c]">Settings</h1>
        <p className="mt-2 text-sm text-[#6b6578]">
          Your account, office profile, branding, and email delivery configuration.
        </p>
      </div>
      <div className="mx-auto max-w-4xl px-6 py-6 sm:px-8">
        <section className="rounded-md border border-[#e6e6ec] bg-white p-6">
          <h2 className="text-lg font-semibold text-[#21004c]">My account</h2>
          <p className="mt-1 text-sm text-[#6b6578]">
            Change your display name{session.role === "super_admin" ? " and network label" : ""}. Emails use your name
            as the sender. You can also reset your login password here.
          </p>
          <form action={updateAccountAction} className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#6b6578]">Your name</label>
              <input
                name="name"
                defaultValue={session.name}
                required
                className="h-10 w-full rounded-md border border-[#c8c8d3] px-3 text-sm outline-none focus:border-[#21004c]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#6b6578]">Login email</label>
              <input
                value={session.email}
                readOnly
                className="h-10 w-full rounded-md border border-[#c8c8d3] bg-[#f6f3f9] px-3 text-sm text-[#6b6578]"
              />
            </div>
            {session.role === "super_admin" ? (
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-[#6b6578]">Office network name</label>
                <input
                  name="networkName"
                  defaultValue={profile.networkName}
                  required
                  className="h-10 w-full rounded-md border border-[#c8c8d3] px-3 text-sm outline-none focus:border-[#21004c]"
                />
                <p className="mt-1 text-[11px] text-[#6b6578]">Shown in the header under your name (e.g. All offices / network label).</p>
              </div>
            ) : null}
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#6b6578]">New password</label>
              <input
                name="newPassword"
                type="password"
                autoComplete="new-password"
                placeholder="Leave blank to keep current"
                className="h-10 w-full rounded-md border border-[#c8c8d3] px-3 text-sm outline-none focus:border-[#21004c]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#6b6578]">Confirm new password</label>
              <input
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder="Repeat new password"
                className="h-10 w-full rounded-md border border-[#c8c8d3] px-3 text-sm outline-none focus:border-[#21004c]"
              />
            </div>
            <button className="h-10 rounded-md bg-[#4c00ff] px-4 text-sm font-bold text-white md:col-span-2">
              Save account
            </button>
          </form>
        </section>

        {session.role === "super_admin" && allOffices.length > 0 && (
          <form method="get" className="mt-6 flex flex-col gap-3 rounded-md border border-[#e6e6ec] bg-white p-5 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="office" className="mb-1 block text-xs font-semibold text-[#6b6578]">
                Edit an office profile
              </label>
              <select
                id="office"
                name="office"
                defaultValue={selectedOffice?.id || ""}
                className="h-10 w-full rounded-md border border-[#c8c8d3] px-3 text-sm outline-none focus:border-[#21004c]"
              >
                <option value="">Select office</option>
                {allOffices.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="h-10 rounded-md bg-[#21004c] px-5 text-sm font-bold text-white">Open settings</button>
          </form>
        )}

        {selectedOffice && (
          <section className="mt-6 rounded-md border border-[#e6e6ec] bg-white p-6">
            <h2 className="text-lg font-semibold text-[#21004c]">Office portal profile</h2>
            <p className="mt-1 text-sm text-[#6b6578]">
              This identity appears in the office portal, emails, and signing certificates.
            </p>
            {canEditOffice ? (
              <form action={updateOfficeAction} className="mt-5 grid gap-4 md:grid-cols-2">
                <input type="hidden" name="officeId" value={selectedOffice.id} />
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#6b6578]">Office name</label>
                  <input
                    name="name"
                    defaultValue={selectedOffice.name}
                    required
                    className="h-10 w-full rounded-md border border-[#c8c8d3] px-3 text-sm outline-none focus:border-[#21004c]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#6b6578]">Contact email</label>
                  <input
                    name="email"
                    type="email"
                    defaultValue={selectedOffice.email}
                    className="h-10 w-full rounded-md border border-[#c8c8d3] px-3 text-sm outline-none focus:border-[#21004c]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#6b6578]">Phone</label>
                  <input
                    name="phone"
                    defaultValue={selectedOffice.phone}
                    className="h-10 w-full rounded-md border border-[#c8c8d3] px-3 text-sm outline-none focus:border-[#21004c]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#6b6578]">Accent color</label>
                  <input
                    name="brandColor"
                    type="color"
                    defaultValue={selectedOffice.brandColor || "#21004c"}
                    className="h-10 w-full rounded-md border border-[#c8c8d3] p-1"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-[#6b6578]">Address</label>
                  <textarea
                    name="address"
                    rows={3}
                    defaultValue={selectedOffice.address}
                    className="w-full rounded-md border border-[#c8c8d3] px-3 py-2 text-sm outline-none focus:border-[#21004c]"
                  />
                </div>
                <button className="h-10 rounded-md bg-[#21004c] px-4 text-sm font-bold text-white md:col-span-2">
                  Save office profile
                </button>
              </form>
            ) : (
              <dl className="mt-5 grid gap-4 text-sm md:grid-cols-2">
                <div>
                  <dt className="text-[#6b6578]">Office</dt>
                  <dd className="font-semibold">{selectedOffice.name}</dd>
                </div>
                <div>
                  <dt className="text-[#6b6578]">Email</dt>
                  <dd>{selectedOffice.email || "Not set"}</dd>
                </div>
                <div>
                  <dt className="text-[#6b6578]">Phone</dt>
                  <dd>{selectedOffice.phone || "Not set"}</dd>
                </div>
                <div>
                  <dt className="text-[#6b6578]">Address</dt>
                  <dd>{selectedOffice.address || "Not set"}</dd>
                </div>
              </dl>
            )}
          </section>
        )}

        <section className="mt-6 rounded-md border border-[#e6e6ec] bg-white p-6">
          <h2 className="text-lg font-semibold text-[#21004c]">Email / SMTP</h2>
          <p className="mt-1 text-sm text-[#6b6578]">
            Choose <strong>Custom / cPanel</strong> or <strong>Gmail SMTP</strong>. Set <strong>From name</strong> so
            inboxes show your name, not only the address.
          </p>
          {session.role === "super_admin" ? (
            <>
              <SmtpSettingsForm status={smtpStatus} defaultTestEmail={session.email} saveAction={saveSmtpAction} />
              <details className="mt-6">
                <summary className="cursor-pointer text-sm font-semibold text-[#6b6578]">
                  Optional: other environment variables (APP_URL, secrets)
                </summary>
                <pre className="mt-3 overflow-auto rounded-md bg-[#21004c] p-5 text-xs text-white">{`APP_URL=https://sign.yourdomain.com
ADMIN_NAME=Network Administrator
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=use-a-strong-password
SESSION_SECRET=use-a-long-random-secret
OTP_SECRET=use-another-long-random-secret
REQUIRE_EMAIL_OTP=false`}</pre>
                <p className="mt-3 text-sm text-[#6b6578]">
                  After you reset password in My account, the Settings password is used for login (env password is
                  ignored until you clear app-profile.json).
                </p>
              </details>
            </>
          ) : (
            <p className="mt-4 text-sm text-[#6b6578]">
              Only the network administrator can view or change SMTP credentials.
              {smtpStatus.configured ? " Email delivery is currently configured on this server." : ""}
            </p>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
