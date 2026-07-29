function parseIntEnv(name: string, fallback: number) {
  const value = Number(process.env[name] || "");
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

export const workflowConfig = {
  maxRecipientsPerEnvelope: parseIntEnv("MAX_RECIPIENTS_PER_ENVELOPE", 100),
  maxRecipientsPerSigningStep: parseIntEnv("MAX_RECIPIENTS_PER_SIGNING_STEP", 100),
  maxManualRecipientsPerRequest: parseIntEnv("MAX_MANUAL_RECIPIENTS_PER_REQUEST", 200),
  otpMaxAttempts: parseIntEnv("OTP_MAX_ATTEMPTS", 5),
  otpLockoutMinutes: parseIntEnv("OTP_LOCKOUT_MINUTES", 15),
  otpResendCooldownSeconds: parseIntEnv("OTP_RESEND_COOLDOWN_SECONDS", 60),
  otpTtlMinutes: parseIntEnv("OTP_TTL_MINUTES", 10),
  signingRateLimitWindowSeconds: parseIntEnv("SIGNING_RATE_LIMIT_WINDOW_SECONDS", 60),
  signingRateLimitMaxRequests: parseIntEnv("SIGNING_RATE_LIMIT_MAX_REQUESTS", 60),
};

