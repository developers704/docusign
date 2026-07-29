import AdminShell from "@/components/AdminShell";
import { Icon } from "@/components/Icons";
import { getSessionOffice, requireAdmin } from "@/lib/auth";

const flowSteps = [
  { label: "Upload", tone: "bg-[#f3efff] text-[#4c00ff]" },
  { label: "Approve", tone: "bg-[#f3efff] text-[#4c00ff]" },
  { label: "Sign", tone: "bg-[#f3efff] text-[#4c00ff]" },
  { label: "Complete", tone: "bg-[#e2f8ed] text-[#087a4a]" },
] as const;

export default async function WorkflowsPage() {
  const session = await requireAdmin();
  const office = await getSessionOffice(session);
  const cards = [
    {
      title: "Standard signature",
      detail: "Send to one or more recipients in signing order.",
      steps: "Upload → Recipients → Sign → Complete",
      status: "Active",
    },
    {
      title: "Manager approval",
      detail: "Route an agreement for internal approval before signature.",
      steps: "Prepare → Approve → Send → Complete",
      status: "Draft",
    },
    {
      title: "Office onboarding",
      detail: "Reusable onboarding flow with identity verification.",
      steps: "Invite → Verify → Sign → Archive",
      status: "Active",
    },
  ];

  return (
    <AdminShell session={session} office={office}>
      <div className="border-b border-[#e6e6ec] px-6 py-6 sm:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold text-[#6b6578]">Automation</p>
            <h1 className="mt-1 text-[32px] font-normal tracking-[-.02em] text-[#21004c]">Workflows</h1>
            <p className="mt-2 text-sm text-[#6b6578]">
              Build repeatable agreement processes with approvals, signing order and notifications.
            </p>
          </div>
          <button className="inline-flex items-center justify-center gap-2 rounded-md bg-[#21004c] px-4 py-2.5 text-sm font-bold text-white">
            <Icon name="plus" className="h-4 w-4" />
            Create workflow
          </button>
        </div>
      </div>

      <div className="px-6 py-6 sm:px-8">
        <section className="rounded-lg border border-[#e6e6ec] bg-white p-5 sm:p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-2 rounded-full bg-[#eee8ff] px-3 py-1 text-[11px] font-extrabold text-[#4c00ff]">
                <Icon name="sparkle" className="h-3.5 w-3.5" />
                Workflow builder
              </span>
              <h2 className="mt-4 text-2xl font-extrabold text-[#21004c]">Automate the steps around every agreement</h2>
              <p className="mt-2 text-sm leading-6 text-[#6b6578]">
                Set recipient roles, approvals, reminders, expiration rules and completion actions once, then reuse the
                process across offices.
              </p>
            </div>

            <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-1">
              {flowSteps.map((step, index) => (
                <div key={step.label} className="flex items-center gap-1.5">
                  <span className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] font-bold ${step.tone}`}>
                    {step.label}
                  </span>
                  {index < flowSteps.length - 1 && <Icon name="arrow" className="h-3.5 w-3.5 shrink-0 text-[#a296ac]" />}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          {cards.map((card) => (
            <article key={card.title} className="rounded-lg border border-[#e6e6ec] bg-white p-5">
              <div className="flex items-start justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f0eaff] text-[#4c00ff]">
                  <Icon name="workflow" className="h-5 w-5" />
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${
                    card.status === "Active" ? "bg-[#ddf8e9] text-[#087a4a]" : "bg-[#f0edf2] text-[#766c80]"
                  }`}
                >
                  {card.status}
                </span>
              </div>
              <h3 className="mt-4 text-lg font-extrabold text-[#21004c]">{card.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#6b6578]">{card.detail}</p>
              <div className="mt-4 rounded-md bg-[#faf8fc] p-3 text-xs font-semibold text-[#6f6479]">{card.steps}</div>
              <button className="mt-4 inline-flex items-center gap-1.5 text-xs font-extrabold text-[#4c00ff]">
                Open workflow <Icon name="arrow" className="h-4 w-4" />
              </button>
            </article>
          ))}
        </section>
      </div>
    </AdminShell>
  );
}
