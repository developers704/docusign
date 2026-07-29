import type { EnvelopeStatus, RecipientStatus } from "@/lib/types";

const styles: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  scheduled: "bg-[#f0ebff] text-[#21004c]",
  pending: "bg-slate-100 text-slate-700",
  sent: "bg-blue-100 text-blue-800",
  viewed: "bg-amber-100 text-amber-800",
  verified: "bg-purple-100 text-purple-800",
  completed: "bg-emerald-100 text-emerald-800",
  signed: "bg-emerald-100 text-emerald-800",
  declined: "bg-red-100 text-red-800",
  voided: "bg-rose-100 text-rose-800",
  expired: "bg-orange-100 text-orange-800",
};

export default function StatusBadge({ status }: { status: EnvelopeStatus | RecipientStatus }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${styles[status] || styles.pending}`}>{status.replaceAll("_", " ")}</span>;
}
