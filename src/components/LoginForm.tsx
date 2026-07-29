"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icons";

export default function LoginForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setMessage("");
    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: formData.get("email"), password: formData.get("password"), remember: formData.get("remember") === "on" }) });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) { setMessage(result.error || "Sign in failed."); return; }
      router.push("/"); router.refresh();
    } catch { setMessage("Connection error. Please try again."); }
    finally { setLoading(false); }
  }

  return <form onSubmit={submit} className="space-y-5">
    <div><label htmlFor="email" className="mb-2 block text-sm font-bold text-[#372748]">Email address</label><input id="email" name="email" type="email" autoComplete="email" required placeholder="name@company.com" className="h-12 w-full rounded-xl border border-[#ddd6e2] bg-white px-4 text-sm outline-none transition placeholder:text-[#aaa0b2] focus:border-[#7950ff] focus:ring-4 focus:ring-[#eee8ff]"/></div>
    <div><div className="mb-2 flex items-center justify-between"><label htmlFor="password" className="text-sm font-bold text-[#372748]">Password</label><button type="button" onClick={() => setMessage("Contact your office administrator to reset your password.")} className="text-xs font-bold text-[#4c00ff]">Forgot password?</button></div><input id="password" name="password" type="password" autoComplete="current-password" required placeholder="Enter your password" className="h-12 w-full rounded-xl border border-[#ddd6e2] bg-white px-4 text-sm outline-none transition placeholder:text-[#aaa0b2] focus:border-[#7950ff] focus:ring-4 focus:ring-[#eee8ff]"/></div>
    <label className="flex items-center gap-3 text-xs font-semibold text-[#74697c]"><input name="remember" type="checkbox" className="h-4 w-4 rounded border-[#ccc2d2] accent-[#4c00ff]"/>Keep me signed in on this device</label>
    {message && <p className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700">{message}</p>}
    <button disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#4c00ff] px-4 text-sm font-extrabold text-white shadow-lg shadow-violet-200 transition hover:bg-[#3d00cf] disabled:opacity-50">{loading ? "Signing in..." : <>Sign in <Icon name="arrow" className="h-4 w-4"/></>}</button>
  </form>;
}
