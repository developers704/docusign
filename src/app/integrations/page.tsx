import AdminShell from "@/components/AdminShell";
import { Icon, type IconName } from "@/components/Icons";
import { getSessionOffice, requireAdmin } from "@/lib/auth";

export default async function IntegrationsPage() {
  const session = await requireAdmin();
  const office = await getSessionOffice(session);
  const integrations: Array<{ name: string; desc: string; icon: IconName; status: string }> = [
    {
      name: "SMTP Email",
      desc: "Send signature requests, OTP codes, reminders and completed documents.",
      icon: "send",
      status: process.env.SMTP_HOST ? "Connected" : "Setup required",
    },
    {
      name: "Google Drive",
      desc: "Archive completed agreements to shared folders.",
      icon: "integration",
      status: "Available",
    },
    {
      name: "Microsoft OneDrive",
      desc: "Connect office storage and document libraries.",
      icon: "integration",
      status: "Available",
    },
    {
      name: "Dropbox",
      desc: "Import PDFs and export completed agreements.",
      icon: "integration",
      status: "Available",
    },
    {
      name: "Webhooks",
      desc: "Notify external systems when agreement events occur.",
      icon: "workflow",
      status: "Developer",
    },
    {
      name: "REST API",
      desc: "Create agreements and retrieve status from business apps.",
      icon: "settings",
      status: "Developer",
    },
  ];

  return (
    <AdminShell session={session} office={office}>
      <div className="border-b border-[#e6e6ec] px-6 py-6 sm:px-8">
        <p className="text-sm font-semibold text-[#6b6578]">Connections</p>
        <h1 className="mt-1 text-[32px] font-normal tracking-[-.02em] text-[#21004c]">Integrations</h1>
        <p className="mt-2 text-sm text-[#6b6578]">
          Connect agreement workflows with email, storage and internal business systems.
        </p>
      </div>

      <div className="px-6 py-6 sm:px-8">
        <section className="rounded-md bg-[#21004c] p-6 text-white sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-extrabold">
                <Icon name="sparkle" className="h-3.5 w-3.5" />
                Integration center
              </span>
              <h2 className="mt-4 text-2xl font-semibold">Connect every agreement to the tools your offices already use.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">
                Configure email delivery first, then add storage, webhooks and custom API access as your workflow grows.
              </p>
            </div>
            <div className="rounded-md border border-white/20 bg-white/10 p-5">
              <p className="text-xs font-bold uppercase tracking-[.14em] text-white/60">Recommended first step</p>
              <h3 className="mt-2 text-lg font-semibold">Configure cPanel SMTP</h3>
              <p className="mt-2 text-sm text-white/70">
                Add SMTP environment variables on hosting so customers receive secure signing links automatically.
              </p>
              <a
                href="#smtp"
                className="mt-4 inline-flex h-9 items-center gap-2 rounded-md bg-white px-4 text-xs font-bold text-[#21004c]"
              >
                Open setup <Icon name="arrow" className="h-4 w-4" />
              </a>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {integrations.map((i) => (
            <article
              key={i.name}
              id={i.name === "SMTP Email" ? "smtp" : undefined}
              className="rounded-md border border-[#e6e6ec] bg-white p-5"
            >
              <div className="flex items-start justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#f0eaff] text-[#4c00ff]">
                  <Icon name={i.icon} className="h-5 w-5" />
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                    i.status === "Connected" ? "bg-[#ddf8e9] text-[#087a4a]" : "bg-[#f1edf3] text-[#74697c]"
                  }`}
                >
                  {i.status}
                </span>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-[#21004c]">{i.name}</h3>
              <p className="mt-2 min-h-12 text-sm leading-6 text-[#6b6578]">{i.desc}</p>
              <button className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-[#4c00ff]">
                Configure <Icon name="arrow" className="h-4 w-4" />
              </button>
            </article>
          ))}
        </section>

        <section className="mt-6 rounded-md border border-[#e6e6ec] bg-white p-6">
          <h2 className="text-lg font-semibold text-[#21004c]">SMTP environment variables</h2>
          <p className="mt-2 text-sm text-[#6b6578]">
            Set these through cPanel Node.js App environment variables, not directly in source code.
          </p>
          <pre className="mt-5 overflow-x-auto rounded-md bg-[#21004c] p-5 text-xs leading-6 text-white">{`APP_URL=https://sign.yourdomain.com
SMTP_HOST=mail.yourdomain.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=signatures@yourdomain.com
SMTP_PASS=your-secure-password
EMAIL_FROM=Valliani Agreements <signatures@yourdomain.com>`}</pre>
        </section>
      </div>
    </AdminShell>
  );
}
