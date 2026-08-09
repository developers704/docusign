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
          <div><p className="text-xl font-extrabold tracking-[-.035em]">Valliani Documents</p><p className="text-[10px] font-bold uppercase tracking-[.2em] text-white/55">Documents Cloud</p></div>
        </div>
        <div className="relative max-w-xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold backdrop-blur"><Icon name="shield" className="h-4 w-4"/>Secure multi-office platform</span>
          <h1 className="mt-6 text-5xl font-extrabold leading-[1.05] tracking-[-.04em] xl:text-6xl">Contracts move faster when every step is connected.</h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-white/70">Prepare, send, sign and track business contracts through isolated office workspaces with full audit visibility.</p>
          <div className="mt-10 grid grid-cols-3 gap-4">
            {[['OTP','Identity verification'],['SHA-256','Document integrity'],['Audit','Complete history']].map(([value,label])=><div key={value} className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur"><p className="text-xl font-extrabold">{value}</p><p className="mt-1 text-xs text-white/55">{label}</p></div>)}
          </div>
        </div>
        <p className="relative text-xs text-white/45">Private deployment · Original interface · Internal company use</p>
      </section>
      <section className="flex min-h-screen items-center justify-center bg-[#fbfafc] px-5 py-10 sm:px-10">
        <div className="w-full max-w-[460px]">
          <div className="mb-10 flex items-center gap-3 lg:hidden"><span className="flex h-10 w-10 items-center justify-center rounded-xl brand-gradient text-white"><span className="h-4 w-4 rotate-45 border-2 border-white"/></span><strong className="text-lg font-extrabold tracking-[-.035em]">Valliani Documents</strong></div>
          <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#4c00ff]">Secure portal</p>
          <h2 className="mt-3 text-4xl font-extrabold tracking-[-.035em] text-[#211431]">Welcome back</h2>
          <p className="mt-3 text-sm leading-6 text-[#7d7286]">Sign in with your network or office portal account.</p>
          <div className="mt-8"><LoginForm /></div>
          <div className="mt-8 flex items-start gap-3 rounded-2xl border border-[#e9e3ed] bg-white p-4 text-xs leading-5 text-[#74697c] soft-shadow"><Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0 text-[#4c00ff]"/><p>Change all default credentials and the session secret before publishing the application.</p></div>
        </div>
      </section>
    </main>
  );
}
