import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  authenticatePortalUser,
  getOfficeById,
  getUserById,
  readAppProfile,
  verifyPassword,
} from "./store";
import type { OfficeRecord, UserRole } from "./types";

const COOKIE_NAME = "company_esign_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 12;

function getSessionSecret() {
  return process.env.SESSION_SECRET || "change-this-session-secret-before-production";
}

function sign(value: string) {
  return crypto.createHmac("sha256", getSessionSecret()).update(value).digest("hex");
}

function timingSafeTextEqual(value: string, expected: string) {
  const actualDigest = crypto.createHash("sha256").update(value).digest();
  const expectedDigest = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(actualDigest, expectedDigest);
}

export type AppSession = {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  officeId: string | null;
  expiresAt: number;
};

export async function verifyCredentials(email: string, password: string): Promise<AppSession | null> {
  const configuredEmail = process.env.ADMIN_EMAIL || "admin@example.com";
  const configuredPassword = process.env.ADMIN_PASSWORD || "ChangeMe123!";
  const normalizedEmail = email.trim().toLowerCase();
  const profile = await readAppProfile();
  const superAdminEmail = (profile.adminEmail || configuredEmail).trim().toLowerCase();

  if (timingSafeTextEqual(normalizedEmail, superAdminEmail)) {
    let passwordOk = false;
    if (profile.adminPasswordSalt && profile.adminPasswordHash) {
      passwordOk = verifyPassword(password, profile.adminPasswordSalt, profile.adminPasswordHash);
    } else {
      passwordOk = timingSafeTextEqual(password, configuredPassword);
    }
    if (passwordOk) {
      return {
        userId: "environment-super-admin",
        email: superAdminEmail,
        name: profile.adminName || process.env.ADMIN_NAME || "Network Administrator",
        role: "super_admin",
        officeId: null,
        expiresAt: 0,
      };
    }
  }

  const portal = await authenticatePortalUser(normalizedEmail, password);
  if (!portal) return null;

  return {
    userId: portal.user.id,
    email: portal.user.email,
    name: portal.user.name,
    role: portal.user.role,
    officeId: portal.user.officeId,
    expiresAt: 0,
  };
}

export function createSessionToken(session: Omit<AppSession, "expiresAt">) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
  const payload = Buffer.from(JSON.stringify({ ...session, expiresAt })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token: string | undefined): AppSession | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<AppSession>;
    if (
      !parsed.userId ||
      !parsed.email ||
      !parsed.name ||
      !parsed.role ||
      !parsed.expiresAt ||
      parsed.expiresAt < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    if (!["super_admin", "office_admin", "office_user", "viewer"].includes(parsed.role)) {
      return null;
    }
    return {
      userId: parsed.userId,
      email: parsed.email,
      name: parsed.name,
      role: parsed.role,
      officeId: parsed.officeId || null,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

export async function getAppSession() {
  const cookieStore = await cookies();
  const session = readSessionToken(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return null;
  if (session.role === "super_admin") {
    const profile = await readAppProfile();
    return {
      ...session,
      name: profile.adminName || session.name,
      email: profile.adminEmail || process.env.ADMIN_EMAIL || session.email,
    };
  }

  const user = await getUserById(session.userId);
  if (!user || !user.isActive || user.officeId !== session.officeId) return null;
  const office = await getOfficeById(user.officeId);
  if (!office || !office.isActive) return null;

  return {
    ...session,
    name: user.name,
    email: user.email,
    role: user.role,
    officeId: user.officeId,
  };
}

/** Refresh the signed session cookie after profile changes (name, etc.). */
export async function refreshSessionCookie(session: AppSession) {
  const cookieStore = await cookies();
  cookieStore.set(
    COOKIE_NAME,
    createSessionToken({
      userId: session.userId,
      email: session.email,
      name: session.name,
      role: session.role,
      officeId: session.officeId,
    }),
    {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === "true" || (process.env.APP_URL || "").startsWith("https://"),
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DURATION_SECONDS,
    }
  );
}

export async function requireAdmin() {
  const session = await getAppSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireSuperAdmin() {
  const session = await requireAdmin();
  if (session.role !== "super_admin") redirect("/");
  return session;
}

export async function requireAdminApi() {
  return getAppSession();
}

export function canAccessOffice(session: AppSession, officeId: string) {
  return session.role === "super_admin" || session.officeId === officeId;
}

export function canCreateEnvelopes(session: AppSession) {
  return session.role !== "viewer";
}

/** Delete agreements: network admin or office admin only (not office_user / viewer). */
export function canDeleteAgreements(session: AppSession) {
  return session.role === "super_admin" || session.role === "office_admin";
}

export function canManageOfficeUsers(session: AppSession, officeId: string) {
  return session.role === "super_admin" || (session.role === "office_admin" && session.officeId === officeId);
}

export async function getSessionOffice(session: AppSession): Promise<OfficeRecord | undefined> {
  return session.officeId ? getOfficeById(session.officeId) : undefined;
}

export const sessionCookieName = COOKIE_NAME;
export const sessionDurationSeconds = SESSION_DURATION_SECONDS;
