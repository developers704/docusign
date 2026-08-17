import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import { Icon } from "@/components/Icons";
import { getAppSession } from "@/lib/auth";

export default async function LoginPage() {
  if (await getAppSession()) redirect("/");
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1.1fr_.9fr]">
      <section className="relative hidden overflow-hidden brand-gradient p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
        <div className="absolute inset-0 brand-grid opacity-60" />
        <div className="absolute -left-20 top-1/3 h-72 w-72 rounded-full bg-[#a869ff]/30 blur-3xl" />
        <div className="absolute -right-24 bottom-16 h-80 w-80 rounded-full bg-[#ff3dbb]/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 shadow-xl backdrop-blur"><span className="h-5 w-5 rotate-45 rounded-[3px] border-[3px] border-white"/><span className="absolute h-2.5 w-2.5 rotate-45 rounded-[2px] bg-white"/></span>
          <div><p className="text-xl font-extrabold tracking-[-.035em]">Valliani Contracts</p><p className="text-[10px] font-bold uppercase tracking-[.2em] text-white/55">Contracts Cloud</p></div>
        </div>
        <div className="relative flex flex-1 flex-col justify-center py-12 max-w-xl">
          <span className="inline-flex w-fit rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.22em] text-white/80 backdrop-blur">
            Valliani Contracts
          </span>
          <h1 className="mt-8 text-4xl font-extrabold leading-[1.12] tracking-[-.035em] xl:text-5xl">
            Your secure contract workspace.
          </h1>
          <p className="mt-8 max-w-md text-base leading-7 text-white/65">
            Create, send, and manage Valliani agreements from one secure workspace.
          </p>
          <p className="mt-5 max-w-md text-[15px] leading-7 text-white/50">
            Built for Valliani teams — prepare documents, route them to signers, and follow every agreement through to completion.
          </p>
          <ul className="mt-12 max-w-md space-y-5 border-t border-white/10 pt-10">
            {[
              "Send agreements for review and signature",
              "Track progress across offices and recipients",
              "Keep a secure record of every contract",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-[15px] leading-6 text-white/70">
                <span className="mt-2 h-1 w-6 shrink-0 rounded-full bg-white/35" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/45">Valliani Contracts · Internal workspace</p>
      </section>
      <section className="flex min-h-screen items-center justify-center bg-[#fbfafc] px-5 py-10 sm:px-10">
        <div className="w-full max-w-[460px]">
          <div className="mb-10 flex items-center gap-3 lg:hidden"><span className="flex h-10 w-10 items-center justify-center rounded-xl brand-gradient text-white"><span className="h-4 w-4 rotate-45 border-2 border-white"/></span><strong className="text-lg font-extrabold tracking-[-.035em]">Valliani Contracts</strong></div>
          <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#4c00ff]">Valliani Contracts</p>
          <h2 className="mt-3 text-4xl font-extrabold tracking-[-.035em] text-[#211431]">Welcome back</h2>
          <p className="mt-3 text-sm leading-6 text-[#7d7286]">Sign in with your Valliani network or office account.</p>
          <div className="mt-8"><LoginForm /></div>
          <div className="mt-8 flex items-start gap-3 rounded-2xl border border-[#e9e3ed] bg-white p-4 text-xs leading-5 text-[#74697c] soft-shadow">
            <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0 text-[#4c00ff]" />
            <p>Authorized Valliani staff only. Contact your administrator if you need access.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
