"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icons";

type Props = {
  token: string;
  title: string;
  officeName: string;
  recipientName: string;
  envelopeNumber: string;
  action: "signed" | "approved" | "acknowledged";
  envelopeCompleted: boolean;
  signedAt: string | null;
};

function actionPhrase(action: Props["action"]) {
  if (action === "approved") return "approved";
  if (action === "acknowledged") return "acknowledged";
  return "signed";
}

export default function SignThankYouView({
  token,
  title,
  officeName,
  recipientName,
  envelopeNumber,
  action,
  envelopeCompleted,
  signedAt,
}: Props) {
  const [visible, setVisible] = useState(false);
  const signedHref = `/api/sign/${encodeURIComponent(token)}/download?type=signed`;
  const originalHref = `/api/sign/${encodeURIComponent(token)}/download?type=original`;
  const verb = actionPhrase(action);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f6f3f9] text-[#1c1230]">
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(76,0,255,0.14), transparent 55%), radial-gradient(ellipse 60% 40% at 100% 100%, rgba(134,28,255,0.08), transparent 50%), radial-gradient(ellipse 50% 35% at 0% 80%, rgba(33,0,76,0.06), transparent 45%)",
        }}
      />

      <header className="relative z-10 border-b border-[#e7e2ec]/80 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl brand-gradient text-[10px] font-black text-white shadow-lg shadow-violet-200/60">
              VC
            </span>
            <div>
              <p className="text-sm font-extrabold tracking-tight">{officeName}</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#958a9f]">Secure e-signature</p>
            </div>
          </div>
          <div className="hidden items-center gap-1.5 rounded-full bg-[#f0ebff] px-3 py-1.5 text-[11px] font-bold text-[#4c00ff] sm:flex">
            <Icon name="shield" className="h-3.5 w-3.5" />
            Encrypted session
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto flex max-w-3xl flex-col px-5 py-10 sm:px-8 sm:py-14">
        <div
          className={`transition-all duration-700 ease-out ${
            visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
          }`}
        >
          <div className="overflow-hidden rounded-[28px] border border-[#e7e2ec] bg-white shadow-[0_24px_60px_rgba(40,18,72,0.1)]">
            <div
              className="relative px-6 pb-10 pt-12 text-center sm:px-10 sm:pb-12 sm:pt-14"
              style={{
                background: "linear-gradient(135deg, #21004c 0%, #4c00ff 55%, #861cff 100%)",
                color: "#ffffff",
              }}
            >
              <div
                className="pointer-events-none absolute inset-0 opacity-30"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 20% 20%, rgba(255,255,255,.2) 0 1px, transparent 2px), radial-gradient(circle at 80% 40%, rgba(255,255,255,.15) 0 1px, transparent 2px)",
                  backgroundSize: "28px 28px, 40px 40px",
                }}
              />
              <div className="relative z-[1]">
                <div
                  className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full transition-transform duration-700 ${
                    visible ? "scale-100" : "scale-75"
                  }`}
                  style={{ background: "rgba(255,255,255,0.18)", boxShadow: "0 0 0 4px rgba(255,255,255,0.22)" }}
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#4c00ff] shadow-lg">
                    <Icon name="check" className="h-6 w-6" />
                  </span>
                </div>
                <p
                  className="mt-6 text-[11px] font-bold uppercase tracking-[0.22em]"
                  style={{ color: "rgba(255,255,255,0.85)" }}
                >
                  Thank you
                </p>
                <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ color: "#ffffff" }}>
                  You&apos;ve successfully {verb}
                </h1>
                <p
                  className="mx-auto mt-3 max-w-lg text-sm leading-relaxed sm:text-[15px]"
                  style={{ color: "rgba(255,255,255,0.9)" }}
                >
                  {recipientName}, your electronic signature has been securely recorded for this contract.
                  You can close this window whenever you&apos;re ready.
                </p>
              </div>
            </div>

            <div className="space-y-6 px-6 py-8 sm:px-10">
              <div className="rounded-2xl border border-[#eee9f1] bg-[#faf8fc] p-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9a90a3]">Contract</p>
                <h2 className="mt-1 text-lg font-extrabold text-[#1c1230]">{title}</h2>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-[11px] font-semibold text-[#958a9f]">From</dt>
                    <dd className="font-bold text-[#3a2f4a]">{officeName}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold text-[#958a9f]">Contract</dt>
                    <dd className="font-bold text-[#3a2f4a]">{envelopeNumber}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold text-[#958a9f]">Signed by</dt>
                    <dd className="font-bold text-[#3a2f4a]">{recipientName}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold text-[#958a9f]">Recorded</dt>
                    <dd className="font-bold text-[#3a2f4a]">
                      {signedAt ? new Date(signedAt).toLocaleString() : "Just now"}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 px-5 py-4">
                <p className="text-sm font-bold text-emerald-950">
                  {envelopeCompleted
                    ? "All required parties have finished. This contract is complete."
                    : "Your step is done. Other recipients may still need to finish their part."}
                </p>
                <p className="mt-1 text-xs leading-5 text-emerald-900/75">
                  A confirmation may also be sent to your email. Keep a copy of the PDF for your records.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <a
                  href={signedHref}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#4c00ff] px-5 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-violet-200 transition hover:bg-[#3d00cf]"
                >
                  <Icon name="download" className="h-4 w-4" />
                  {envelopeCompleted ? "Download completed PDF" : "Download signed copy"}
                </a>
                <a
                  href={originalHref}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#ddd6e2] bg-white px-5 py-3.5 text-sm font-extrabold text-[#3a2f4a] transition hover:bg-[#faf8fc]"
                >
                  <Icon name="file" className="h-4 w-4" />
                  Download original
                </a>
              </div>

              <div className="flex items-start gap-3 rounded-2xl border border-[#eee9f1] px-4 py-3.5">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f0ebff] text-[#4c00ff]">
                  <Icon name="shield" className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-bold text-[#1c1230]">Legally recorded e-signature</p>
                  <p className="mt-0.5 text-xs leading-5 text-[#6d647a]">
                    Your action was captured with a secure audit trail — including time, signer identity, and
                    document integrity — through Valliani Contracts.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-8 text-center text-xs text-[#958a9f]">
            Powered by <span className="font-bold text-[#675c71]">valliani contracts</span>
          </p>
        </div>
      </div>
    </main>
  );
}
