import type {
  PowerFormAccessChallengeRecord,
  PowerFormAnalyticsSnapshot,
  PowerFormRecord,
  PowerFormSubmissionRecord,
} from "@/lib/types";

export type PowerFormListFilter = {
  officeId?: string | null;
  status?: PowerFormRecord["status"] | PowerFormRecord["status"][];
  templateId?: string;
};

export interface PowerFormRepository {
  list(filter?: PowerFormListFilter): Promise<PowerFormRecord[]>;
  getById(id: string): Promise<PowerFormRecord | undefined>;
  getBySlug(slug: string): Promise<PowerFormRecord | undefined>;
  create(record: PowerFormRecord): Promise<PowerFormRecord>;
  update(record: PowerFormRecord): Promise<PowerFormRecord>;
  delete(id: string): Promise<void>;
}

export interface PowerFormSubmissionRepository {
  listByPowerFormId(powerFormId: string): Promise<PowerFormSubmissionRecord[]>;
  listByOfficeId(officeId: string): Promise<PowerFormSubmissionRecord[]>;
  getById(id: string): Promise<PowerFormSubmissionRecord | undefined>;
  getByEnvelopeId(envelopeId: string): Promise<PowerFormSubmissionRecord | undefined>;
  create(record: PowerFormSubmissionRecord): Promise<PowerFormSubmissionRecord>;
  update(record: PowerFormSubmissionRecord): Promise<PowerFormSubmissionRecord>;
}

export interface PowerFormAccessRepository {
  listByPowerFormId(powerFormId: string): Promise<PowerFormAccessChallengeRecord[]>;
  getById(id: string): Promise<PowerFormAccessChallengeRecord | undefined>;
  create(record: PowerFormAccessChallengeRecord): Promise<PowerFormAccessChallengeRecord>;
  update(record: PowerFormAccessChallengeRecord): Promise<PowerFormAccessChallengeRecord>;
  deleteExpired(beforeIso: string): Promise<number>;
}

export interface PowerFormAnalyticsRepository {
  getByPowerFormId(powerFormId: string): Promise<PowerFormAnalyticsSnapshot | undefined>;
  upsert(snapshot: PowerFormAnalyticsSnapshot): Promise<PowerFormAnalyticsSnapshot>;
}

export type PowerFormRepositories = {
  forms: PowerFormRepository;
  submissions: PowerFormSubmissionRepository;
  access: PowerFormAccessRepository;
  analytics: PowerFormAnalyticsRepository;
};
