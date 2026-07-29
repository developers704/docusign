import { getPowerFormRepositories } from "@/lib/repositories/jsonPowerFormRepositories";
import type { PowerFormAnalyticsSnapshot, PowerFormSubmissionRecord } from "@/lib/types";

export async function refreshPowerFormAnalytics(powerFormId: string) {
  const repos = getPowerFormRepositories();
  const form = await repos.forms.getById(powerFormId);
  if (!form) return null;
  const submissions = await repos.submissions.listByPowerFormId(powerFormId);
  const snapshot: PowerFormAnalyticsSnapshot = {
    schemaVersion: 1,
    powerFormId,
    officeId: form.officeId,
    totalSubmissions: submissions.length,
    completedSubmissions: submissions.filter((s) => s.status === "completed").length,
    failedSubmissions: submissions.filter((s) => s.status === "failed" || s.status === "blocked").length,
    signingSubmissions: submissions.filter((s) =>
      ["envelope_created", "signing", "verified"].includes(s.status)
    ).length,
    lastSubmissionAt: submissions[0]?.createdAt || form.lastSubmissionAt,
    updatedAt: new Date().toISOString(),
  };
  await repos.analytics.upsert(snapshot);
  return snapshot;
}

export async function getPowerFormAnalytics(powerFormId: string) {
  const repos = getPowerFormRepositories();
  const existing = await repos.analytics.getByPowerFormId(powerFormId);
  if (existing) return existing;
  return refreshPowerFormAnalytics(powerFormId);
}

export function summarizeSubmissions(submissions: PowerFormSubmissionRecord[]) {
  return {
    total: submissions.length,
    completed: submissions.filter((s) => s.status === "completed").length,
    signing: submissions.filter((s) => ["envelope_created", "signing"].includes(s.status)).length,
    failed: submissions.filter((s) => s.status === "failed" || s.status === "blocked").length,
  };
}
