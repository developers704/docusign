"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icons";
import PasswordInput from "./PasswordInput";

export default function LoginForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpStep, setOtpStep] = useState<{ challengeId: string; maskedEmail: string; remember: boolean } | null>(
    null
  );
  const [otp, setOtp] = useState("");

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const formData = new FormData(event.currentTarget);
    const remember = formData.get("remember") === "on";
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.get("email"),
          password: formData.get("password"),
          remember,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        requiresOtp?: boolean;
        challengeId?: string;
        maskedEmail?: string;
      };
      if (!response.ok) {
        setMessage(result.error || "Sign in failed.");
        return;
      }
      if (result.requiresOtp && result.challengeId) {
        setOtpStep({
          challengeId: result.challengeId,
          maskedEmail: result.maskedEmail || "your email",
          remember,
        });
        setOtp("");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setMessage("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function submitOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!otpStep) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/login/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: otpStep.challengeId,
          otp,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(result.error || "Verification failed.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setMessage("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (otpStep) {
    return (
      <form onSubmit={submitOtp} className="space-y-5">
        <div>
          <p className="text-sm font-semibold text-[#372748]">Enter verification code</p>
          <p className="mt-1 text-sm text-[#74697c]">
            We sent a 6-character code to <strong>{otpStep.maskedEmail}</strong>. Enter it to open your portal.
          </p>
        </div>
        <div>
          <label htmlFor="otp" className="mb-2 block text-sm font-bold text-[#372748]">
            Verification code
          </label>
          <input
            id="otp"
            name="otp"
            value={otp}
            onChange={(event) => setOtp(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
            autoComplete="one-time-code"
            required
            placeholder="ABC123"
            className="h-12 w-full rounded-xl border border-[#ddd6e2] bg-white px-4 text-center text-lg font-bold tracking-[0.25em] outline-none transition placeholder:tracking-normal placeholder:text-[#aaa0b2] focus:border-[#7950ff] focus:ring-4 focus:ring-[#eee8ff]"
          />
        </div>
        {message ? (
          <p className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700">{message}</p>
        ) : null}
        <button
          disabled={loading || otp.length < 6}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#4c00ff] px-4 text-sm font-extrabold text-white shadow-lg shadow-violet-200 transition hover:bg-[#3d00cf] disabled:opacity-50"
        >
          {loading ? "Verifying..." : "Verify and continue"}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            setOtpStep(null);
            setOtp("");
            setMessage("");
          }}
          className="w-full text-center text-sm font-semibold text-[#4c00ff]"
        >
          Back to sign in
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submitPassword} className="space-y-5">
      <div>
        <label htmlFor="email" className="mb-2 block text-sm font-bold text-[#372748]">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="name@company.com"
          className="h-12 w-full rounded-xl border border-[#ddd6e2] bg-white px-4 text-sm outline-none transition placeholder:text-[#aaa0b2] focus:border-[#7950ff] focus:ring-4 focus:ring-[#eee8ff]"
        />
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-bold text-[#372748]">
            Password
          </label>
          <button
            type="button"
            onClick={() => setMessage("Contact your office administrator to reset your password.")}
            className="text-xs font-bold text-[#4c00ff]"
          >
            Forgot password?
          </button>
        </div>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
          placeholder="Enter your password"
        />
      </div>
      <label className="flex items-center gap-3 text-xs font-semibold text-[#74697c]">
        <input name="remember" type="checkbox" className="h-4 w-4 rounded border-[#ccc2d2] accent-[#4c00ff]" />
        Keep me signed in on this device
      </label>
      {message ? (
        <p className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700">{message}</p>
      ) : null}
      <button
        disabled={loading}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#4c00ff] px-4 text-sm font-extrabold text-white shadow-lg shadow-violet-200 transition hover:bg-[#3d00cf] disabled:opacity-50"
      >
        {loading ? (
          "Signing in..."
        ) : (
          <>
            Sign in <Icon name="arrow" className="h-4 w-4" />
          </>
        )}
      </button>
    </form>
  );
}
