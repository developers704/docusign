import { redirect } from "next/navigation";
import AdminShell from "@/components/AdminShell";
import EnvelopeActions from "@/components/EnvelopeActions";
import LocalDateTime from "@/components/LocalDateTime";
import { EnvelopePdfViewer } from "@/components/PdfPageCanvas";
import StatusBadge from "@/components/StatusBadge";
import { canAccessOffice, canDeleteAgreements, getSessionOffice, requireAdmin } from "@/lib/auth";
import { getCurrentRecipient, getEnvelopeById, getOfficeById, readAuditEvents } from "@/lib/store";

export default async function EnvelopePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  const { id } = await params;
  const envelope = await getEnvelopeById(id);
  if (!envelope || !canAccessOffice(session, envelope.officeId)) {
    // Prefer agreements list over a blank Next.js 404 when a notification is stale.
    redirect("/agreements");
  }
  const office = session.officeId ? await getSessionOffice(session) : await getOfficeById(envelope.officeId);
  const audit = (await readAuditEvents(id, envelope.officeId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const currentRecipient = getCurrentRecipient(envelope);
  const canOperate = session.role !== "viewer";
  const canSend = canOperate && ["draft", "scheduled"].includes(envelope.status);
  const canRemind = canOperate && Boolean(currentRecipient) && ["sent", "viewed"].includes(envelope.status);
  const canVoid = canOperate && !["completed", "voided"].includes(envelope.status);
  const canDelete = canDeleteAgreements(session);
  const someoneSigned = envelope.recipients.some((recipient) =>
    ["signed", "completed", "approved", "acknowledged"].includes(recipient.status)
  );
  const canCorrect =
    canOperate && ["sent", "viewed", "scheduled"].includes(envelope.status) && !someoneSigned;
  const documentSrc = `/api/admin/envelopes/${envelope.id}/document`;

  return (
    <AdminShell session={session} office={office}>
      <div className="px-4 py-6 sm:px-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-bold">{envelope.title}</h1><StatusBadge status={envelope.status} /></div>
          <p className="mt-1 text-sm text-slate-500">
            {envelope.officeName} · {envelope.envelopeNumber} · Created <LocalDateTime value={envelope.createdAt} />
          </p>
          {envelope.status === "scheduled" && envelope.scheduledSendAt ? (
            <p className="mt-1 text-sm font-medium text-[#4c00ff]">
              Scheduled send:{" "}
              <LocalDateTime
                value={envelope.scheduledSendAt}
                mode="schedule"
                timeZone={envelope.scheduledTimezone}
              />
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {canOperate && envelope.status === "draft" && (
            <>
              <a
                href={`/documents/new?draft=${envelope.id}`}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800"
              >
                Edit recipients
              </a>
              <a href={`/prepare/${envelope.id}`} className="rounded-xl bg-[#4c00ff] px-4 py-2.5 text-sm font-semibold text-white">
                Prepare fields
              </a>
            </>
          )}
        </div>
      </div>

      {(canSend || canRemind || canVoid || canDelete || canCorrect) && (
        <div id="send-schedule" className="mt-5 max-w-2xl">
          <EnvelopeActions
            envelopeId={envelope.id}
            canSend={canSend}
            canRemind={canRemind}
            canVoid={canVoid}
            canDelete={canDelete}
            canCorrect={canCorrect}
            status={envelope.status}
            scheduledSendAt={envelope.scheduledSendAt || null}
            scheduledTimezone={envelope.scheduledTimezone || null}
          />
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap gap-3">
              <a href={`/api/admin/envelopes/${envelope.id}/download?type=original`} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Download original</a>
              <a href={documentSrc} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Open PDF</a>
              {envelope.signedPdfPath && <a href={`/api/admin/envelopes/${envelope.id}/download?type=signed`} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Download completed PDF</a>}
            </div>
            <div className="mt-5">
              <EnvelopePdfViewer src={documentSrc} title={envelope.title} />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold">Recipients and signing order</h2>
            <div className="mt-4 space-y-3">
              {[...envelope.recipients].sort((a, b) => a.order - b.order).map((recipient) => (
                <div key={recipient.id} className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-[42px_1fr_auto] md:items-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#21004c] font-bold text-white">{recipient.order}</div>
                  <div>
                    <p className="font-semibold">{recipient.name}</p>
                    <p className="text-sm text-slate-500">{recipient.email}</p>
                    <p className="mt-1 text-xs text-slate-500">Secure signing links are issued during invitation and reminders.</p>
                    {recipient.signedAt && (
                      <p className="mt-1 text-xs text-slate-500">
                        Signed <LocalDateTime value={recipient.signedAt} />
                      </p>
                    )}
                  </div>
                  <StatusBadge status={recipient.status} />
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-bold">Envelope details</h2>
            <dl className="mt-4 space-y-4 text-sm">
              <div><dt className="text-slate-500">Office</dt><dd className="font-semibold">{envelope.officeName}</dd></div>
              <div>
                <dt className="text-slate-500">Expires</dt>
                <dd className="font-semibold">
                  {envelope.expiresAt ? <LocalDateTime value={envelope.expiresAt} /> : "No expiration"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Scheduled send</dt>
                <dd className="font-semibold">
                  {envelope.scheduledSendAt ? (
                    <LocalDateTime
                      value={envelope.scheduledSendAt}
                      mode="schedule"
                      timeZone={envelope.scheduledTimezone}
                    />
                  ) : (
                    "Not scheduled"
                  )}
                </dd>
              </div>
              <div><dt className="text-slate-500">Created by</dt><dd className="font-semibold">{envelope.createdBy}</dd></div>
              <div><dt className="text-slate-500">Message</dt><dd>{envelope.message || "No message"}</dd></div>
              {envelope.voidReason && <div><dt className="text-slate-500">Void reason</dt><dd className="text-red-700">{envelope.voidReason}</dd></div>}
            </dl>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-bold">Audit trail</h2>
            <div className="mt-4 space-y-4">
              {audit.length === 0 ? <p className="text-sm text-slate-500">No activity yet.</p> : audit.map((event) => (
                <div key={event.id} className="border-l-2 border-slate-200 pl-4">
                  <p className="text-sm font-semibold">{event.message}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    <LocalDateTime value={event.createdAt} />
                  </p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
      </div>
    </AdminShell>
  );
}
