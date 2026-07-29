import type { EnvelopeRecord } from "@/lib/types";
import { getOfficeById, getUserById } from "@/lib/store";
import { resolveSmtpConfig } from "@/lib/smtp";

function extractEmail(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const angled = raw.match(/<([^>]+@[^>]+)>/);
  if (angled?.[1]) return angled[1].trim().toLowerCase();
  if (raw.includes("@")) return raw.toLowerCase();
  return null;
}

/** Emails that should receive sender/office activity notices (viewed / signed). */
export async function resolveSenderNotifyEmails(envelope: EnvelopeRecord): Promise<string[]> {
  const emails = new Set<string>();

  const office = await getOfficeById(envelope.officeId);
  const officeEmail = extractEmail(office?.email);
  if (officeEmail) emails.add(officeEmail);

  if (envelope.createdByUserId) {
    const user = await getUserById(envelope.createdByUserId);
    const userEmail = extractEmail(user?.email);
    if (userEmail) emails.add(userEmail);
  }

  const createdByEmail = extractEmail(envelope.createdBy);
  if (createdByEmail) emails.add(createdByEmail);

  // Fallback: SMTP From / User from Settings (jo email setup kiya hai)
  if (!emails.size) {
    const smtp = await resolveSmtpConfig();
    const fromEmail = extractEmail(smtp?.from) || extractEmail(smtp?.user);
    if (fromEmail) emails.add(fromEmail);
  }

  return [...emails];
}
