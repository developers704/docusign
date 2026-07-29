import {
  readPowerFormAccessChallenges,
  readPowerFormAnalytics,
  readPowerFormSubmissions,
  readPowerForms,
  writePowerFormAccessChallenges,
  writePowerFormAnalytics,
  writePowerFormSubmissions,
  writePowerForms,
} from "@/lib/store";
import { normalizePowerFormRecord } from "@/lib/powerFormNormalize";
import type {
  PowerFormAccessChallengeRecord,
  PowerFormAnalyticsSnapshot,
  PowerFormRecord,
  PowerFormSubmissionRecord,
} from "@/lib/types";
import type {
  PowerFormAccessRepository,
  PowerFormAnalyticsRepository,
  PowerFormListFilter,
  PowerFormRepositories,
  PowerFormRepository,
  PowerFormSubmissionRepository,
} from "@/lib/repositories/powerFormRepositories";

class JsonPowerFormRepository implements PowerFormRepository {
  async list(filter?: PowerFormListFilter): Promise<PowerFormRecord[]> {
    let forms = await readPowerForms(filter?.officeId);
    if (filter?.templateId) forms = forms.filter((form) => form.templateId === filter.templateId);
    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      forms = forms.filter((form) => statuses.includes(form.status));
    }
    return forms.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getById(id: string) {
    const forms = await readPowerForms();
    return forms.find((form) => form.id === id);
  }

  async getBySlug(slug: string) {
    const forms = await readPowerForms();
    return forms.find((form) => form.slug === slug);
  }

  async create(record: PowerFormRecord) {
    const forms = await readPowerForms();
    const normalized = normalizePowerFormRecord(record);
    forms.push(normalized);
    await writePowerForms(forms);
    return normalized;
  }

  async update(record: PowerFormRecord) {
    const forms = await readPowerForms();
    const normalized = normalizePowerFormRecord(record);
    const next = forms.map((form) => (form.id === normalized.id ? normalized : form));
    if (!next.some((form) => form.id === normalized.id)) {
      throw new Error("PowerForm not found.");
    }
    await writePowerForms(next);
    return normalized;
  }

  async delete(id: string) {
    const forms = await readPowerForms();
    await writePowerForms(forms.filter((form) => form.id !== id));
  }
}

class JsonPowerFormSubmissionRepository implements PowerFormSubmissionRepository {
  async listByPowerFormId(powerFormId: string) {
    const rows = await readPowerFormSubmissions(powerFormId);
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listByOfficeId(officeId: string) {
    const rows = await readPowerFormSubmissions();
    return rows.filter((row) => row.officeId === officeId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getById(id: string) {
    const rows = await readPowerFormSubmissions();
    return rows.find((row) => row.id === id);
  }

  async getByEnvelopeId(envelopeId: string) {
    const rows = await readPowerFormSubmissions();
    return rows.find((row) => row.envelopeId === envelopeId);
  }

  async create(record: PowerFormSubmissionRecord) {
    const rows = await readPowerFormSubmissions();
    rows.push(record);
    await writePowerFormSubmissions(rows);
    return record;
  }

  async update(record: PowerFormSubmissionRecord) {
    const rows = await readPowerFormSubmissions();
    const next = rows.map((row) => (row.id === record.id ? record : row));
    if (!next.some((row) => row.id === record.id)) throw new Error("PowerForm submission not found.");
    await writePowerFormSubmissions(next);
    return record;
  }
}

class JsonPowerFormAccessRepository implements PowerFormAccessRepository {
  async listByPowerFormId(powerFormId: string) {
    return readPowerFormAccessChallenges(powerFormId);
  }

  async getById(id: string) {
    const rows = await readPowerFormAccessChallenges();
    return rows.find((row) => row.id === id);
  }

  async create(record: PowerFormAccessChallengeRecord) {
    const rows = await readPowerFormAccessChallenges();
    rows.push(record);
    await writePowerFormAccessChallenges(rows);
    return record;
  }

  async update(record: PowerFormAccessChallengeRecord) {
    const rows = await readPowerFormAccessChallenges();
    const next = rows.map((row) => (row.id === record.id ? record : row));
    if (!next.some((row) => row.id === record.id)) throw new Error("PowerForm access challenge not found.");
    await writePowerFormAccessChallenges(next);
    return record;
  }

  async deleteExpired(beforeIso: string) {
    const rows = await readPowerFormAccessChallenges();
    const kept = rows.filter((row) => row.expiresAt >= beforeIso || Boolean(row.verifiedAt));
    const removed = rows.length - kept.length;
    if (removed > 0) await writePowerFormAccessChallenges(kept);
    return removed;
  }
}

class JsonPowerFormAnalyticsRepository implements PowerFormAnalyticsRepository {
  async getByPowerFormId(powerFormId: string) {
    const rows = await readPowerFormAnalytics();
    return rows.find((row) => row.powerFormId === powerFormId);
  }

  async upsert(snapshot: PowerFormAnalyticsSnapshot) {
    const rows = await readPowerFormAnalytics();
    const index = rows.findIndex((row) => row.powerFormId === snapshot.powerFormId);
    if (index >= 0) rows[index] = snapshot;
    else rows.push(snapshot);
    await writePowerFormAnalytics(rows);
    return snapshot;
  }
}

let cached: PowerFormRepositories | null = null;

export function getPowerFormRepositories(): PowerFormRepositories {
  if (!cached) {
    cached = {
      forms: new JsonPowerFormRepository(),
      submissions: new JsonPowerFormSubmissionRepository(),
      access: new JsonPowerFormAccessRepository(),
      analytics: new JsonPowerFormAnalyticsRepository(),
    };
  }
  return cached;
}
