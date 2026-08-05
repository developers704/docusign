import crypto from "node:crypto";
import type {
  AuditEvent,
  EnvelopeRecord,
  OfficeRecord,
  PowerFormRecord,
  SmtpSettingsRecord,
  TemplateFolderRecord,
  TemplateRecord,
  UserRecord,
  WebFormRecord,
} from "@/lib/types";
import { fromMysqlDateTime, getPool, toMysqlDateTime } from "@/lib/db";

function hashToken(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function requirePool() {
  const pool = getPool();
  if (!pool) throw new Error("MySQL is not configured.");
  return pool;
}

export async function mysqlReadOffices(activeOnly = false): Promise<OfficeRecord[]> {
  const pool = requirePool();
  const [rows] = await pool.query(
    `SELECT id, name, slug, email, phone, address, brand_color AS brandColor, is_active AS isActive,
            created_at AS createdAt, updated_at AS updatedAt
     FROM offices ${activeOnly ? "WHERE is_active = 1" : ""} ORDER BY name ASC`
  );
  return (rows as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    email: String(row.email || ""),
    phone: String(row.phone || ""),
    address: String(row.address || ""),
    brandColor: String(row.brandColor || "#21004c"),
    isActive: Boolean(row.isActive),
    createdAt: fromMysqlDateTime(row.createdAt as string),
    updatedAt: fromMysqlDateTime(row.updatedAt as string),
  }));
}

export async function mysqlWriteOffices(offices: OfficeRecord[]) {
  const pool = requirePool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    await conn.query("DELETE FROM offices");
    for (const office of offices) {
      await conn.query(
        `INSERT INTO offices
          (id, name, slug, email, phone, address, brand_color, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          office.id,
          office.name,
          office.slug,
          office.email || "",
          office.phone || "",
          office.address || "",
          office.brandColor || "#21004c",
          office.isActive ? 1 : 0,
          toMysqlDateTime(office.createdAt),
          toMysqlDateTime(office.updatedAt),
        ]
      );
    }
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function mysqlReadUsers(): Promise<UserRecord[]> {
  const pool = requirePool();
  const [rows] = await pool.query(
    `SELECT id, office_id AS officeId, name, email, role, password_salt AS passwordSalt,
            password_hash AS passwordHash, is_active AS isActive, created_at AS createdAt,
            updated_at AS updatedAt, last_login_at AS lastLoginAt
     FROM users ORDER BY created_at ASC`
  );
  return (rows as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    officeId: String(row.officeId),
    name: String(row.name),
    email: String(row.email),
    role: row.role as UserRecord["role"],
    passwordSalt: String(row.passwordSalt),
    passwordHash: String(row.passwordHash),
    isActive: Boolean(row.isActive),
    createdAt: fromMysqlDateTime(row.createdAt as string),
    updatedAt: fromMysqlDateTime(row.updatedAt as string),
    lastLoginAt: row.lastLoginAt ? fromMysqlDateTime(row.lastLoginAt as string) : null,
  }));
}

export async function mysqlWriteUsers(users: UserRecord[]) {
  const pool = requirePool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    await conn.query("DELETE FROM users");
    for (const user of users) {
      await conn.query(
        `INSERT INTO users
          (id, office_id, name, email, role, password_salt, password_hash, is_active, created_at, updated_at, last_login_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          user.id,
          user.officeId,
          user.name,
          user.email,
          user.role,
          user.passwordSalt,
          user.passwordHash,
          user.isActive ? 1 : 0,
          toMysqlDateTime(user.createdAt),
          toMysqlDateTime(user.updatedAt),
          toMysqlDateTime(user.lastLoginAt),
        ]
      );
    }
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function mysqlReadTemplates(officeId?: string | null): Promise<TemplateRecord[]> {
  const pool = requirePool();
  const [rows] = officeId
    ? await pool.query(`SELECT payload FROM templates WHERE office_id = ? ORDER BY updated_at DESC`, [officeId])
    : await pool.query(`SELECT payload FROM templates ORDER BY updated_at DESC`);
  return (rows as Array<{ payload: string }>).map((row) => JSON.parse(row.payload) as TemplateRecord);
}

export async function mysqlWriteTemplates(templates: TemplateRecord[]) {
  const pool = requirePool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM template_folder_links");
    await conn.query("DELETE FROM templates");
    for (const template of templates) {
      await conn.query(
        `INSERT INTO templates
          (id, office_id, name, title, status, visibility, payload, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          template.id,
          template.officeId,
          template.name,
          template.title || template.name,
          template.status,
          template.visibility,
          JSON.stringify(template),
          toMysqlDateTime(template.createdAt),
          toMysqlDateTime(template.updatedAt),
        ]
      );
      for (const folderId of template.folderIds || []) {
        await conn.query(`INSERT IGNORE INTO template_folder_links (template_id, folder_id) VALUES (?, ?)`, [
          template.id,
          folderId,
        ]);
      }
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function mysqlReadTemplateFolders(officeId?: string | null): Promise<TemplateFolderRecord[]> {
  const pool = requirePool();
  const [rows] = officeId
    ? await pool.query(
        `SELECT id, office_id AS officeId, name, kind, created_at AS createdAt, updated_at AS updatedAt
         FROM template_folders WHERE office_id = ? ORDER BY name ASC`,
        [officeId]
      )
    : await pool.query(
        `SELECT id, office_id AS officeId, name, kind, created_at AS createdAt, updated_at AS updatedAt
         FROM template_folders ORDER BY name ASC`
      );
  return (rows as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    officeId: String(row.officeId),
    name: String(row.name),
    kind: (row.kind === "shared" ? "shared" : "my") as TemplateFolderRecord["kind"],
    createdAt: fromMysqlDateTime(row.createdAt as string),
    updatedAt: fromMysqlDateTime(row.updatedAt as string),
  }));
}

export async function mysqlWriteTemplateFolders(folders: TemplateFolderRecord[]) {
  const pool = requirePool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    // Keep template_folder_links; only replace folder rows.
    await conn.query("DELETE FROM template_folders");
    for (const folder of folders) {
      await conn.query(
        `INSERT INTO template_folders (id, office_id, name, kind, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          folder.id,
          folder.officeId,
          folder.name,
          folder.kind,
          toMysqlDateTime(folder.createdAt),
          toMysqlDateTime(folder.updatedAt),
        ]
      );
    }
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function mysqlReadEnvelopes(officeId?: string | null): Promise<EnvelopeRecord[]> {
  const pool = requirePool();
  const [rows] = officeId
    ? await pool.query(`SELECT payload FROM envelopes WHERE office_id = ? ORDER BY updated_at DESC`, [officeId])
    : await pool.query(`SELECT payload FROM envelopes ORDER BY updated_at DESC`);
  return (rows as Array<{ payload: string }>).map((row) => JSON.parse(row.payload) as EnvelopeRecord);
}

export async function mysqlWriteEnvelopes(envelopes: EnvelopeRecord[]) {
  const pool = requirePool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    await conn.query("DELETE FROM recipients");
    await conn.query("DELETE FROM envelopes");
    for (const envelope of envelopes) {
      await conn.query(
        `INSERT INTO envelopes
          (id, office_id, envelope_number, title, status, payload, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          envelope.id,
          envelope.officeId,
          envelope.envelopeNumber,
          envelope.title,
          envelope.status,
          JSON.stringify(envelope),
          toMysqlDateTime(envelope.createdAt),
          toMysqlDateTime(envelope.updatedAt),
        ]
      );
      for (const recipient of envelope.recipients || []) {
        await conn.query(
          `INSERT INTO recipients
            (id, envelope_id, email, name, status, signing_order, token_hash, payload, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            recipient.id,
            envelope.id,
            recipient.email,
            recipient.name,
            recipient.status,
            recipient.order || 1,
            recipient.tokenHash || null,
            JSON.stringify(recipient),
            toMysqlDateTime(envelope.createdAt),
            toMysqlDateTime(envelope.updatedAt),
          ]
        );
      }
    }
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function mysqlFindEnvelopeByToken(token: string) {
  const pool = requirePool();
  let normalized = String(token || "").trim();
  try {
    normalized = decodeURIComponent(normalized) || normalized;
  } catch {
    // keep raw token
  }
  const tokenHash = hashToken(normalized);
  const envelopes = await mysqlReadEnvelopes();

  for (let envelopeIndex = 0; envelopeIndex < envelopes.length; envelopeIndex += 1) {
    const recipientIndex = envelopes[envelopeIndex].recipients.findIndex((recipient) => {
      const hashMatch = Boolean(recipient.tokenHash && recipient.tokenHash === tokenHash);
      const legacyMatch = Boolean(recipient.signingToken && recipient.signingToken === normalized);
      return hashMatch || legacyMatch;
    });
    if (recipientIndex >= 0) {
      return {
        envelopes,
        envelopeIndex,
        recipientIndex,
        envelope: envelopes[envelopeIndex],
        recipient: envelopes[envelopeIndex].recipients[recipientIndex],
      };
    }
  }
  return undefined;
}

export async function mysqlReadAuditEvents(envelopeId?: string, officeId?: string | null): Promise<AuditEvent[]> {
  const pool = requirePool();
  let sql = `SELECT payload FROM audit_events WHERE 1=1`;
  const params: string[] = [];
  if (envelopeId) {
    sql += ` AND envelope_id = ?`;
    params.push(envelopeId);
  }
  if (officeId) {
    sql += ` AND office_id = ?`;
    params.push(officeId);
  }
  sql += ` ORDER BY created_at DESC`;
  const [rows] = await pool.query(sql, params);
  return (rows as Array<{ payload: string | null }>).map((row) => {
    if (row.payload) return JSON.parse(row.payload) as AuditEvent;
    return {} as AuditEvent;
  }).filter((item) => item.id);
}

export async function mysqlAddAuditEvent(event: AuditEvent) {
  const pool = requirePool();
  await pool.query(
    `INSERT INTO audit_events
      (id, office_id, envelope_id, recipient_id, event_type, message, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event.id,
      event.officeId || null,
      event.envelopeId || null,
      event.recipientId || null,
      event.type,
      event.message,
      JSON.stringify(event),
      toMysqlDateTime(event.createdAt),
    ]
  );
}

export async function mysqlWriteAuditViaPayloads(events: AuditEvent[]) {
  const pool = requirePool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM audit_events");
    for (const event of events) {
      await conn.query(
        `INSERT INTO audit_events
          (id, office_id, envelope_id, recipient_id, event_type, message, payload, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          event.id,
          event.officeId || null,
          event.envelopeId || null,
          event.recipientId || null,
          event.type,
          event.message,
          JSON.stringify(event),
          toMysqlDateTime(event.createdAt),
        ]
      );
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function mysqlReadPowerForms(officeId?: string | null): Promise<PowerFormRecord[]> {
  const pool = requirePool();
  const [rows] = officeId
    ? await pool.query(`SELECT payload FROM powerforms WHERE office_id = ? ORDER BY updated_at DESC`, [officeId])
    : await pool.query(`SELECT payload FROM powerforms ORDER BY updated_at DESC`);
  return (rows as Array<{ payload: string }>).map((row) => JSON.parse(row.payload) as PowerFormRecord);
}

export async function mysqlWritePowerForms(forms: PowerFormRecord[]) {
  const pool = requirePool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM powerforms");
    for (const form of forms) {
      await conn.query(
        `INSERT INTO powerforms
          (id, office_id, template_id, name, slug, status, payload, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          form.id,
          form.officeId,
          form.templateId,
          form.name,
          form.slug,
          form.status,
          JSON.stringify(form),
          toMysqlDateTime(form.createdAt),
          toMysqlDateTime(form.updatedAt),
        ]
      );
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function mysqlReadWebForms(officeId?: string | null): Promise<WebFormRecord[]> {
  const pool = requirePool();
  const [rows] = officeId
    ? await pool.query(`SELECT payload FROM webforms WHERE office_id = ? ORDER BY updated_at DESC`, [officeId])
    : await pool.query(`SELECT payload FROM webforms ORDER BY updated_at DESC`);
  return (rows as Array<{ payload: string }>).map((row) => JSON.parse(row.payload) as WebFormRecord);
}

export async function mysqlWriteWebForms(forms: WebFormRecord[]) {
  const pool = requirePool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM webforms");
    for (const form of forms) {
      await conn.query(
        `INSERT INTO webforms
          (id, office_id, template_id, name, slug, status, payload, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          form.id,
          form.officeId,
          form.templateId,
          form.name,
          form.slug,
          form.status,
          JSON.stringify(form),
          toMysqlDateTime(form.createdAt),
          toMysqlDateTime(form.updatedAt),
        ]
      );
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function mysqlReadSmtpSettings(): Promise<SmtpSettingsRecord | null> {
  const pool = requirePool();
  const [rows] = await pool.query(
    `SELECT host, port, secure, user_name AS userName, pass_value AS passValue,
            from_address AS fromAddress, updated_at AS updatedAt
     FROM smtp_settings WHERE id = 1 LIMIT 1`
  );
  const row = (rows as Array<Record<string, unknown>>)[0];
  if (!row) return null;
  // TINYINT may arrive as 0/1, "0"/"1", or Buffer — Boolean("0") is wrongly true.
  const secureRaw = row.secure as unknown;
  const secure =
    secureRaw === true ||
    secureRaw === 1 ||
    secureRaw === "1" ||
    (typeof Buffer !== "undefined" && Buffer.isBuffer(secureRaw) && secureRaw.length > 0 && secureRaw[0] === 1);
  return {
    host: String(row.host),
    port: Number(row.port) || 465,
    secure,
    user: String(row.userName),
    pass: String(row.passValue ?? ""),
    from: String(row.fromAddress),
    updatedAt: fromMysqlDateTime(row.updatedAt as string),
    provider: String(row.host).toLowerCase().includes("gmail.com") ? "gmail" : "custom",
  };
}

export async function mysqlWriteSmtpSettings(settings: SmtpSettingsRecord) {
  const pool = requirePool();
  await pool.query(
    `INSERT INTO smtp_settings (id, host, port, secure, user_name, pass_value, from_address, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       host = VALUES(host),
       port = VALUES(port),
       secure = VALUES(secure),
       user_name = VALUES(user_name),
       pass_value = VALUES(pass_value),
       from_address = VALUES(from_address),
       updated_at = VALUES(updated_at)`,
    [
      settings.host,
      settings.port,
      settings.secure ? 1 : 0,
      settings.user,
      settings.pass,
      settings.from,
      toMysqlDateTime(settings.updatedAt),
    ]
  );
}
