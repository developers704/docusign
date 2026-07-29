import mysql from "mysql2/promise";

export function isDatabaseConfigured() {
  return Boolean(
    process.env.DATABASE_HOST?.trim() &&
      process.env.DATABASE_USER?.trim() &&
      process.env.DATABASE_NAME?.trim() &&
      process.env.DATABASE_PASSWORD != null &&
      String(process.env.DATABASE_PASSWORD).length > 0
  );
}

let pool: mysql.Pool | null = null;

export function getPool() {
  if (!isDatabaseConfigured()) return null;
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DATABASE_HOST!.trim(),
      port: Number(process.env.DATABASE_PORT || "3306"),
      user: process.env.DATABASE_USER!.trim(),
      password: String(process.env.DATABASE_PASSWORD),
      database: process.env.DATABASE_NAME!.trim(),
      waitForConnections: true,
      connectionLimit: 10,
      enableKeepAlive: true,
      dateStrings: true,
    });
  }
  return pool;
}

export function toMysqlDateTime(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 23).replace("T", " ");
}

export function fromMysqlDateTime(value: string | Date | null | undefined) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  const normalized = String(value).includes("T") ? String(value) : String(value).replace(" ", "T");
  const date = new Date(normalized.endsWith("Z") ? normalized : `${normalized}Z`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : String(value);
}
