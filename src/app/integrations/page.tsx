import { revalidatePath } from "next/cache";
import AdminShell from "@/components/AdminShell";
import IntegrationsManager from "@/components/IntegrationsManager";
import { Icon } from "@/components/Icons";
import { canAccessOffice, getSessionOffice, requireAdmin } from "@/lib/auth";
import {
  integrationsPublicStatus,
  integrationsScopeId,
  readIntegrations,
  writeIntegrations,
} from "@/lib/integrationsStore";
import { getSmtpPublicStatus, isEmailConfigured } from "@/lib/smtp";

async function requireIntegrationsEditor() {
  const session = await requireAdmin();
  if (session.role === "viewer") {
    throw new Error("Viewers cannot change integrations.");
  }
  return session;
}

async function scopeForSession(session: Awaited<ReturnType<typeof requireAdmin>>) {
  if (session.role === "super_admin") {
    return integrationsScopeId(null);
  }
  if (!session.officeId || !canAccessOffice(session, session.officeId)) {
    throw new Error("No office access for integrations.");
  }
  return integrationsScopeId(session.officeId);
}

async function saveStorageAction(formData: FormData) {
  "use server";
  const session = await requireIntegrationsEditor();
  const scopeId = await scopeForSession(session);
  const provider = String(formData.get("provider") || "").trim();
  if (!["googleDrive", "oneDrive"].includes(provider)) {
    return { ok: false, message: "Unknown storage provider." };
  }
  const current = await readIntegrations(scopeId);
  const existing = current[provider as "googleDrive" | "oneDrive"];
  let accessToken = String(formData.get("accessToken") || "").trim();
  if (!accessToken) accessToken = existing?.accessToken || "";
  if (!accessToken) return { ok: false, message: "Access token is required." };
  const folder = String(formData.get("folder") || "").trim();
  const next = {
    ...current,
    scopeId,
    [provider]: {
      enabled: true,
      accessToken,
      folder,
      updatedAt: new Date().toISOString(),
    },
  };
  await writeIntegrations(next);
  revalidatePath("/integrations");
  return { ok: true, message: `${provider} connected. Completed contracts will archive when signing finishes.` };
}

async function disconnectAction(formData: FormData) {
  "use server";
  const session = await requireIntegrationsEditor();
  const scopeId = await scopeForSession(session);
  const provider = String(formData.get("provider") || "").trim();
  const current = await readIntegrations(scopeId);
  const next = { ...current, scopeId };
  if (provider === "googleDrive") next.googleDrive = null;
  else if (provider === "oneDrive") next.oneDrive = null;
  else return { ok: false, message: "Unknown provider." };
  await writeIntegrations(next);
  revalidatePath("/integrations");
  return { ok: true, message: "Disconnected." };
}

export default async function IntegrationsPage() {
  const session = await requireAdmin();
  const office = await getSessionOffice(session);
  const scopeId =
    session.role === "super_admin" ? integrationsScopeId(null) : integrationsScopeId(session.officeId);
  const record = await readIntegrations(scopeId);
  const fullStatus = integrationsPublicStatus(record);
  const status = {
    googleDrive: fullStatus.googleDrive,
    oneDrive: fullStatus.oneDrive,
  };
  const smtpConfigured =
    session.role === "super_admin"
      ? (await getSmtpPublicStatus()).configured
      : await isEmailConfigured(session.officeId);
  const smtpHref =
    session.role === "super_admin"
      ? "/settings"
      : session.officeId
        ? `/settings?office=${encodeURIComponent(session.officeId)}`
        : "/settings";

  return (
    <AdminShell session={session} office={office}>
      <div className="border-b border-[#ebe6f0] px-6 py-6 sm:px-8">
        <p className="text-sm font-semibold text-[#8a7f96]">Connections</p>
        <h1 className="mt-1 text-[32px] font-normal tracking-[-.02em] text-[#2a2040]">Integrations</h1>
        <p className="mt-2 text-sm text-[#6f657c]">
          Activate email and cloud archive for{" "}
          {session.role === "super_admin" ? "the network" : office?.name || "your office"}.
        </p>
      </div>

      <div className="px-6 py-6 sm:px-8">
        <section className="rounded-2xl bg-[#2a2040] p-6 text-white sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-extrabold">
                <Icon name="sparkle" className="h-3.5 w-3.5" />
                Integration center
              </span>
              <h2 className="mt-4 text-2xl font-semibold">Connect contracts to the tools your office already uses.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">
                Configure SMTP first, then connect Google Drive or OneDrive. Connected storage archives completed PDFs
                automatically.
              </p>
            </div>
            <div className="rounded-xl border border-white/20 bg-white/10 p-5">
              <p className="text-xs font-bold uppercase tracking-[.14em] text-white/60">Recommended first step</p>
              <h3 className="mt-2 text-lg font-semibold">Configure SMTP</h3>
              <p className="mt-2 text-sm text-white/70">Required for signing links, OTP, and completion emails.</p>
              <a
                href={smtpHref}
                className="mt-4 inline-flex h-9 items-center gap-2 rounded-md bg-white px-4 text-xs font-bold text-[#2a2040]"
              >
                Open settings <Icon name="arrow" className="h-4 w-4" />
              </a>
            </div>
          </div>
        </section>

        <div className="mt-6">
          {session.role === "viewer" ? (
            <p className="rounded-xl border border-[#ebe6f0] bg-white p-5 text-sm text-[#6f657c]">
              Viewers can see integrations but cannot activate them. Ask an office admin.
            </p>
          ) : (
            <IntegrationsManager
              status={status}
              smtpConnected={smtpConfigured}
              smtpHref={smtpHref}
              saveStorageAction={saveStorageAction}
              disconnectAction={disconnectAction}
            />
          )}
        </div>
      </div>
    </AdminShell>
  );
}
